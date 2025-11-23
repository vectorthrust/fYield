require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const FlareVaultABI = require('../artifacts/contracts/FlareVault.sol/FlareVault.json').abi;
const AAVEManagerABI = require('../artifacts/contracts/AAVEManager.sol/AAVEManager.json').abi;

const app = express();
app.use(express.json());

// Configuration
const FLARE_RPC = process.env.FLARE_RPC_URL || 'https://coston2-api.flare.network/ext/C/rpc';
const MAINNET_RPC = process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com';
const FLARE_VAULT_ADDRESS = process.env.FLARE_VAULT_ADDRESS;
const MAINNET_MANAGER_ADDRESS = process.env.MAINNET_MANAGER_ADDRESS;
const FLARE_OPERATOR_PRIVATE_KEY = process.env.FLARE_DEPLOYER_PRIVATE_KEY;
const AAVE_OPERATOR_PRIVATE_KEY = process.env.AAVE_DEPLOYER_PRIVATE_KEY;

// Providers
const flareProvider = new ethers.JsonRpcProvider(FLARE_RPC);
const mainnetProvider = new ethers.JsonRpcProvider(MAINNET_RPC);

// Operator wallet (same on both chains for simplicity)
const flareWallet = new ethers.Wallet(FLARE_OPERATOR_PRIVATE_KEY, flareProvider);
const mainnetWallet = new ethers.Wallet(AAVE_OPERATOR_PRIVATE_KEY, mainnetProvider);

// Contracts
const flareVault = new ethers.Contract(FLARE_VAULT_ADDRESS, FlareVaultABI, flareWallet);
const mainnetManager = new ethers.Contract(MAINNET_MANAGER_ADDRESS, AAVEManagerABI, mainnetWallet);

// Flare Contract Registry and FTSO setup
const FLARE_CONTRACT_REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const REGISTRY_ABI = [
    'function getContractAddressByName(string memory _name) external view returns (address)'
];
const contractRegistry = new ethers.Contract(FLARE_CONTRACT_REGISTRY, REGISTRY_ABI, flareProvider);

// FTSO Registry interface
const FTSO_REGISTRY_ABI = [
    'function getCurrentPriceWithDecimals(string memory _symbol) external view returns (uint256 _price, uint256 _timestamp, uint256 _decimals)'
];

// Initialize FTSO Registry
let ftsoRegistry;
(async () => {
    const ftsoRegistryAddress = await contractRegistry.getContractAddressByName('FtsoRegistry');
    ftsoRegistry = new ethers.Contract(ftsoRegistryAddress, FTSO_REGISTRY_ABI, flareProvider);
    console.log('FTSO Registry initialized:', ftsoRegistryAddress);
})();

// Track user deposits: user address => USDC amount deposited
const userDeposits = new Map();

// Get current XRP/USD price from Flare FTSO
async function getXRPPrice() {
    try {
        // On Coston2 testnet, use 'testXRP'
        // On Flare mainnet, use 'XRP'
        const symbol = process.env.FLARE_RPC_URL?.includes('coston2') ? 'testXRP' : 'XRP';
        
        const result = await ftsoRegistry.getCurrentPriceWithDecimals(symbol);
        const price = result[0];      // _price
        const timestamp = result[1];  // _timestamp
        const decimals = result[2];   // _decimals
        
        // Convert to human-readable price
        const priceUSD = Number(price) / Math.pow(10, Number(decimals));
        
        console.log(`  ${symbol} Price: $${priceUSD.toFixed(4)} (updated ${Math.floor(Date.now() / 1000) - Number(timestamp)}s ago)`);
        return priceUSD;
    } catch (error) {
        console.error('  Error fetching XRP price:', error.message);
        console.log('  Falling back to $1.00');
        return 1.0; // Fallback
    }
}

// Convert FXRP amount to equivalent USDC amount using current price
async function fxrpToUSDC(fxrpAmount) {
    const xrpPrice = await getXRPPrice();
    
    // fxrpAmount is in 6 decimals (e.g., 1000000 = 1 FXRP)
    const fxrpFloat = Number(fxrpAmount) / 1e6;
    const usdcFloat = fxrpFloat * xrpPrice;
    const usdcAmount = BigInt(Math.floor(usdcFloat * 1e6));
    
    console.log(`  Converting: ${fxrpFloat} FXRP × $${xrpPrice} = ${usdcFloat.toFixed(6)} USDC`);
    
    return usdcAmount;
}

console.log('FXRP Yield Router API');
console.log('Flare Vault:', FLARE_VAULT_ADDRESS);
console.log('Mainnet Manager:', MAINNET_MANAGER_ADDRESS);
console.log('Operator:', flareWallet.address);

// Listen for deposits on Flare
async function watchFlareDeposits() {
    console.log('Watching deposits on Flare...');
    
    flareVault.on('Deposit', async (user, fxrpAmount, timestamp, event) => {
        try {
            console.log(`\nDeposit: ${user}`);
            console.log(`  FXRP: ${ethers.formatUnits(fxrpAmount, 6)}`);
            
            // Calculate USDC amount based on current XRP price
            const usdcAmount = await fxrpToUSDC(fxrpAmount);
            console.log(`  USDC to supply: ${ethers.formatUnits(usdcAmount, 6)}`);
            
            // Store the USDC amount for this user (for withdrawal later)
            const currentDeposit = userDeposits.get(user) || 0n;
            userDeposits.set(user, currentDeposit + usdcAmount);
            
            console.log(`  Supplying to AAVE...`);
            const tx = await mainnetManager.supplyToAAVE(user, usdcAmount, {
                gasLimit: 300000 // Set explicit gas limit for AAVE operations
            });
            await tx.wait();
            
            console.log(`  Supplied to AAVE: ${tx.hash}`);
        } catch (error) {
            console.error(`  Error:`, error.message);
            if (error.reason) {
                console.error(`  Reason:`, error.reason);
            }
        }
    });
}

// Listen for withdrawal requests on Flare
async function watchWithdrawalRequests() {
    console.log('Watching withdrawals on Flare...');
    
    flareVault.on('WithdrawRequested', async (user, vFxrpAmount, timestamp, event) => {
        try {
            console.log(`\nWithdrawal: ${user}`);
            console.log(`  vFXRP: ${ethers.formatUnits(vFxrpAmount, 6)}`);
            
            // Get the USDC amount that was originally deposited for this user
            const usdcPrincipal = userDeposits.get(user) || 0n;
            
            if (usdcPrincipal === 0n) {
                console.error(`  Error: No deposit record found for user ${user}`);
                return;
            }
            
            console.log(`  Original USDC deposited: ${ethers.formatUnits(usdcPrincipal, 6)}`);
            
            console.log(`  Withdrawing from AAVE...`);
            const withdrawTx = await mainnetManager.withdrawFromAAVE(user, usdcPrincipal, {
                gasLimit: 400000 // Set explicit gas limit for AAVE withdrawal
            });
            const withdrawReceipt = await withdrawTx.wait();
            
            const withdrawEvent = withdrawReceipt.logs.find(log => {
                try {
                    const parsed = mainnetManager.interface.parseLog(log);
                    return parsed && parsed.name === 'USDCWithdrawn';
                } catch {
                    return false;
                }
            });
            
            let yieldAmount = 0;
            if (withdrawEvent) {
                const parsed = mainnetManager.interface.parseLog(withdrawEvent);
                yieldAmount = parsed.args.yieldAmount;
                console.log(`  Yield: ${ethers.formatUnits(yieldAmount, 6)} USDC (sent to user on Mainnet)`);
            }
            
            // Clear the deposit record for this user
            userDeposits.delete(user);
            
            console.log(`  Completing on Flare...`);
            const completeTx = await flareVault.completeWithdraw(user, vFxrpAmount, {
                gasLimit: 200000 // Set explicit gas limit for Flare operations
            });
            await completeTx.wait();
            
            console.log(`  Completed: ${completeTx.hash}`);
            console.log(`  User received: ${ethers.formatUnits(vFxrpAmount, 6)} FXRP on Flare + ${ethers.formatUnits(yieldAmount, 6)} USDC yield on Mainnet`);
        } catch (error) {
            console.error(`  Error:`, error.message);
            if (error.reason) {
                console.error(`  Reason:`, error.reason);
            }
        }
    });
}

// REST API Endpoints

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        flareVault: FLARE_VAULT_ADDRESS,
        mainnetManager: MAINNET_MANAGER_ADDRESS,
        operator: flareWallet.address
    });
});

// Get user balance
app.get('/balance/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const balance = await flareVault.getUserBalance(address);
        const supplied = await mainnetManager.userSupplied(address);
        const yield = await mainnetManager.getUserYield(address);
        
        res.json({
            vFxrpBalance: ethers.formatUnits(balance, 6),
            usdcSupplied: ethers.formatUnits(supplied, 6),
            yieldEarned: ethers.formatUnits(yield, 6)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get total stats
app.get('/stats', async (req, res) => {
    try {
        const totalSupplied = await mainnetManager.totalSupplied();
        const aaveBalance = await mainnetManager.getAAVEBalance();
        const totalYield = await mainnetManager.getTotalYieldEarned();
        
        res.json({
            totalSupplied: ethers.formatUnits(totalSupplied, 6),
            aaveBalance: ethers.formatUnits(aaveBalance, 6),
            totalYield: ethers.formatUnits(totalYield, 6)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manual deposit trigger (for testing)
app.post('/manual/deposit', async (req, res) => {
    try {
        const { user, fxrpAmount } = req.body;
        const usdcAmount = vFxrpToUSDC(ethers.parseUnits(fxrpAmount, 6));
        
        const tx = await mainnetManager.supplyToAAVE(user, usdcAmount);
        await tx.wait();
        
        res.json({ 
            success: true,
            txHash: tx.hash,
            usdcSupplied: ethers.formatUnits(usdcAmount, 6)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manual withdrawal trigger (for testing)
app.post('/manual/withdraw', async (req, res) => {
    try {
        const { user, vFxrpAmount } = req.body;
        const usdcPrincipal = vFxrpToUSDC(ethers.parseUnits(vFxrpAmount, 6));
        
        const withdrawTx = await mainnetManager.withdrawFromAAVE(user, usdcPrincipal);
        const withdrawReceipt = await withdrawTx.wait();
        
        // Get yield from event
        const withdrawEvent = withdrawReceipt.logs.find(log => {
            try {
                const parsed = mainnetManager.interface.parseLog(log);
                return parsed && parsed.name === 'USDCWithdrawn';
            } catch {
                return false;
            }
        });
        
        let yieldAmount = 0;
        if (withdrawEvent) {
            const parsed = mainnetManager.interface.parseLog(withdrawEvent);
            yieldAmount = parsed.args.yieldAmount;
        }
        
        const completeTx = await flareVault.completeWithdraw(
            user,
            ethers.parseUnits(vFxrpAmount, 6)
        );
        await completeTx.wait();
        
        res.json({ 
            success: true,
            sepoliaTxHash: withdrawTx.hash,
            flareTxHash: completeTx.hash,
            yieldEarned: ethers.formatUnits(yieldAmount, 6),
            note: 'USDC yield sent to user on Sepolia, FXRP returned on Flare'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`\nAPI running on port ${PORT}`);
    
    try {
        await watchFlareDeposits();
        await watchWithdrawalRequests();
        console.log('Event listeners started\n');
    } catch (error) {
        console.error('Error starting listeners:', error.message);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    process.exit(0);
});

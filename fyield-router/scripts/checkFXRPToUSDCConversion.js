const hre = require("hardhat");

async function main() {
    console.log("Checking FXRP to USDC Conversion\n");

    const provider = ethers.provider;

    // Flare Contract Registry on Coston2
    const FLARE_CONTRACT_REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
    const REGISTRY_ABI = [
        'function getContractAddressByName(string memory _name) external view returns (address)'
    ];
    
    const registry = new ethers.Contract(FLARE_CONTRACT_REGISTRY, REGISTRY_ABI, provider);

    // Get FTSO Registry address
    console.log("=== Fetching FTSO Registry Address ===");
    const ftsoRegistryAddress = await registry.getContractAddressByName('FtsoRegistry');
    console.log(`FTSO Registry: ${ftsoRegistryAddress}\n`);

    // FTSO Registry interface - using the correct method signature
    const FTSO_REGISTRY_ABI = [
        'function getCurrentPriceWithDecimals(string memory _symbol) external view returns (uint256 _price, uint256 _timestamp, uint256 _decimals)'
    ];
    
    const ftsoRegistry = new ethers.Contract(ftsoRegistryAddress, FTSO_REGISTRY_ABI, provider);

    // Get current XRP/USD price from Flare FTSO
    async function getXRPPrice() {
        try {
            console.log("=== Fetching XRP Price from Flare FTSO ===");
            
            // On Coston2 testnet, use testXRP symbol
            const symbol = 'testXRP';
            console.log(`Fetching price for: ${symbol}`);
            
            const result = await ftsoRegistry.getCurrentPriceWithDecimals(symbol);
            
            const price = result[0];      // _price
            const timestamp = result[1];  // _timestamp
            const decimals = result[2];   // _decimals
            
            // Convert to human-readable price
            const priceUSD = Number(price) / Math.pow(10, Number(decimals));
            const priceDate = new Date(Number(timestamp) * 1000);
            const priceAge = Math.floor(Date.now() / 1000) - Number(timestamp);
            
            console.log(`✅ Successfully fetched ${symbol} price\n`);
            
            return { priceUSD, decimals: Number(decimals), timestamp: priceDate, priceAge, isMock: false };
        } catch (error) {
            console.error('Error fetching XRP price:', error.message);
            console.error('Note: On mainnet Flare, use "XRP" instead of "testXRP"');
            throw error;
        }
    }

    // Convert FXRP amount to equivalent USDC amount
    function fxrpToUSDC(fxrpAmount, xrpPrice) {
        // fxrpAmount is in 6 decimals (e.g., 1000000 = 1 FXRP)
        const fxrpFloat = Number(fxrpAmount) / 1e6;
        const usdcFloat = fxrpFloat * xrpPrice;
        const usdcAmount = BigInt(Math.floor(usdcFloat * 1e6));
        
        return { fxrpFloat, usdcFloat, usdcAmount };
    }

    // Get XRP price
    const priceData = await getXRPPrice();

    if (priceData.isMock) {
        console.log(`XRP/USD Price: $${priceData.priceUSD.toFixed(4)} (MOCK for demonstration)`);
    } else {
        console.log(`XRP/USD Price: $${priceData.priceUSD.toFixed(4)}`);
        console.log(`Price Decimals: ${priceData.decimals}`);
        console.log(`Last Updated: ${priceData.timestamp.toISOString()}`);
        console.log(`Age: ${priceData.priceAge} seconds ago`);
        console.log(`Status: ${priceData.priceAge < 300 ? "✅ Fresh" : "⚠️  Stale"}`);
    }
    console.log();

    // Test various FXRP amounts
    console.log("=== Conversion Examples ===");
    const testAmounts = [
        1_000_000n,      // 1 FXRP
        10_000_000n,     // 10 FXRP
        100_000_000n,    // 100 FXRP
        1_000_000_000n,  // 1000 FXRP
        500_000n,        // 0.5 FXRP
        250_000n,        // 0.25 FXRP
    ];

    for (const fxrpAmount of testAmounts) {
        const conversion = fxrpToUSDC(fxrpAmount, priceData.priceUSD);
        
        console.log(`${conversion.fxrpFloat.toFixed(2)} FXRP × $${priceData.priceUSD.toFixed(4)} = ${conversion.usdcFloat.toFixed(6)} USDC`);
        console.log(`  Raw values: ${fxrpAmount} (6 decimals) → ${conversion.usdcAmount} (6 decimals)`);
        console.log(`  Formatted: ${ethers.formatUnits(fxrpAmount, 6)} FXRP → ${ethers.formatUnits(conversion.usdcAmount, 6)} USDC\n`);
    }

    // Verify the conversion is correct
    console.log("=== Verification ===");
    const testFXRP = 10_000_000n; // 10 FXRP
    const result = fxrpToUSDC(testFXRP, priceData.priceUSD);
    const expectedUSDC = 10 * priceData.priceUSD;
    const actualUSDC = Number(result.usdcAmount) / 1e6;
    const difference = Math.abs(expectedUSDC - actualUSDC);
    
    console.log(`Test: 10 FXRP → USDC`);
    console.log(`Expected: ${expectedUSDC.toFixed(6)} USDC`);
    console.log(`Actual: ${actualUSDC.toFixed(6)} USDC`);
    console.log(`Difference: ${difference.toFixed(8)} USDC`);
    
    if (difference < 0.000001) {
        console.log("✅ Conversion is accurate!");
    } else {
        console.log("⚠️  Conversion has significant rounding difference");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

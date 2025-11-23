const hre = require("hardhat");

async function main() {
    console.log("Testing AAVE Supply Directly\n");

    const provider = ethers.provider;
    const operator = new ethers.Wallet(process.env.AAVE_DEPLOYER_PRIVATE_KEY, provider);
    
    const MAINNET_MANAGER_ADDRESS = process.env.MAINNET_MANAGER_ADDRESS;
    const MAINNET_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const MAINNET_AAVE_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";

    console.log("Operator:", operator.address);
    console.log("AAVEManager:", MAINNET_MANAGER_ADDRESS);

    const manager = await ethers.getContractAt("AAVEManager", MAINNET_MANAGER_ADDRESS, operator);
    const usdc = await ethers.getContractAt("IERC20", MAINNET_USDC);
    
    // Check manager's USDC balance
    const managerBalance = await usdc.balanceOf(MAINNET_MANAGER_ADDRESS);
    console.log("\nManager USDC Balance:", ethers.formatUnits(managerBalance, 6), "USDC");

    // Try to supply a small amount
    const testUser = "0x3fCfbB9d43d2da1b684e5ac9d04534e4240c08C7";
    const testAmount = 1_953340n; // 1.95334 USDC (6 decimals)
    
    console.log("\nTesting supply to AAVE:");
    console.log("User:", testUser);
    console.log("Amount:", ethers.formatUnits(testAmount, 6), "USDC");

    try {
        // Estimate gas first
        console.log("\nEstimating gas...");
        const gasEstimate = await manager.supplyToAAVE.estimateGas(testUser, testAmount);
        console.log("Gas estimate:", gasEstimate.toString());

        console.log("\nSending transaction...");
        const tx = await manager.supplyToAAVE(testUser, testAmount, {
            gasLimit: gasEstimate * 120n / 100n // 20% buffer
        });
        console.log("Transaction sent:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("✅ Transaction confirmed!");
        console.log("Gas used:", receipt.gasUsed.toString());
        
    } catch (error) {
        console.error("\n❌ Transaction failed:");
        console.error("Error:", error.message);
        
        if (error.data) {
            console.error("Error data:", error.data);
        }
        
        // Try to decode the error
        if (error.reason) {
            console.error("Reason:", error.reason);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

const hre = require("hardhat");

async function main() {
    console.log("Checking AAVEManager USDC Balance on Mainnet\n");

    const provider = ethers.provider;
    const MAINNET_MANAGER_ADDRESS = process.env.MAINNET_MANAGER_ADDRESS;
    const MAINNET_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    console.log("AAVEManager Address:", MAINNET_MANAGER_ADDRESS);

    const manager = await ethers.getContractAt("AAVEManager", MAINNET_MANAGER_ADDRESS);
    const usdc = await ethers.getContractAt("IERC20", MAINNET_USDC);

    // Check USDC balance
    const usdcBalance = await usdc.balanceOf(MAINNET_MANAGER_ADDRESS);
    console.log("USDC Balance:", ethers.formatUnits(usdcBalance, 6), "USDC");

    // Check contract state
    const totalSupplied = await manager.totalSupplied();
    const totalWithdrawn = await manager.totalWithdrawn();
    const operator = await manager.operator();

    console.log("\n=== Contract State ===");
    console.log("Operator:", operator);
    console.log("Total Supplied to AAVE:", ethers.formatUnits(totalSupplied, 6), "USDC");
    console.log("Total Withdrawn:", ethers.formatUnits(totalWithdrawn, 6), "USDC");

    // Calculate available to supply
    const available = usdcBalance;
    console.log("\n=== Available ===");
    console.log("Available to supply:", ethers.formatUnits(available, 6), "USDC");

    if (available === 0n) {
        console.log("\n⚠️  WARNING: AAVEManager has no USDC!");
        console.log("\n🔧 To fix this:");
        console.log(`1. Send USDC to the AAVEManager contract: ${MAINNET_MANAGER_ADDRESS}`);
        console.log("2. You can send from any wallet that has USDC on Ethereum mainnet");
        console.log("3. Recommended: Start with at least 10 USDC for testing");
        console.log("\nExample using MetaMask or any wallet:");
        console.log(`- Token: USDC (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)`);
        console.log(`- To: ${MAINNET_MANAGER_ADDRESS}`);
        console.log("- Amount: 10+ USDC");
    } else {
        console.log("\n✅ Contract has USDC available!");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

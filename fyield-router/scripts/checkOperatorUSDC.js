const hre = require("hardhat");

async function main() {
    console.log("Checking Operator USDC Balance on Mainnet");

    const provider = ethers.provider;
    const operator = new ethers.Wallet(process.env.AAVE_DEPLOYER_PRIVATE_KEY, provider);
    console.log("Operator Address:", operator.address);

    const MAINNET_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const usdc = await ethers.getContractAt("IERC20", MAINNET_USDC);

    const ethBalance = await provider.getBalance(operator.address);
    const usdcBalance = await usdc.balanceOf(operator.address);

    console.log("\n=== Balances ===");
    console.log("ETH:", ethers.formatEther(ethBalance));
    console.log("USDC:", ethers.formatUnits(usdcBalance, 6));

    if (usdcBalance === 0n) {
        console.log("\n⚠️  WARNING: Operator has no USDC!");
        console.log("You need to send USDC to this address before deposits will work.");
        console.log("\nOptions:");
        console.log("1. Buy USDC on a DEX (Uniswap, etc.)");
        console.log("2. Bridge USDC from another chain");
        console.log("3. Transfer from another wallet");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

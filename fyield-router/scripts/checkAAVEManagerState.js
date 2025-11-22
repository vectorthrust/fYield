const hre = require("hardhat");

async function main() {
    console.log("Checking AAVEManager State on Mainnet");

    const provider = ethers.provider;
    const operator = new ethers.Wallet(process.env.AAVE_DEPLOYER_PRIVATE_KEY, provider);
    console.log("Operator:", operator.address);

    const MAINNET_MANAGER_ADDRESS = process.env.MAINNET_MANAGER_ADDRESS;
    const MAINNET_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const MAINNET_AUSDC = "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c";

    const manager = await ethers.getContractAt("AAVEManager", MAINNET_MANAGER_ADDRESS);
    const usdc = await ethers.getContractAt("IERC20", MAINNET_USDC);
    const aUSDC = await ethers.getContractAt("IERC20", MAINNET_AUSDC);

    console.log("\n=== AAVEManager State ===");
    
    // Check operator
    const currentOperator = await manager.operator();
    console.log("Contract Operator:", currentOperator);
    console.log("Operator Match:", currentOperator.toLowerCase() === operator.address.toLowerCase());

    // Check balances
    const totalSupplied = await manager.totalSupplied();
    const totalWithdrawn = await manager.totalWithdrawn();
    console.log("\nTotal Supplied:", ethers.formatUnits(totalSupplied, 6), "USDC");
    console.log("Total Withdrawn:", ethers.formatUnits(totalWithdrawn, 6), "USDC");

    // Check actual balances
    const managerUSDC = await usdc.balanceOf(MAINNET_MANAGER_ADDRESS);
    const managerAUSDC = await aUSDC.balanceOf(MAINNET_MANAGER_ADDRESS);
    console.log("\nManager USDC Balance:", ethers.formatUnits(managerUSDC, 6), "USDC");
    console.log("Manager aUSDC Balance:", ethers.formatUnits(managerAUSDC, 6), "aUSDC");

    // Calculate yield
    const totalYield = managerAUSDC > totalSupplied ? managerAUSDC - totalSupplied : 0n;
    console.log("Total Yield:", ethers.formatUnits(totalYield, 6), "USDC");

    // Check specific user
    const flareUser = "0x63989F39DdBBA1C72B9459C2BE564Cc455b782B5"; // From the error
    const userSupplied = await manager.userSupplied(flareUser);
    console.log("\n=== User State ===");
    console.log("User Address:", flareUser);
    console.log("User Supplied:", ethers.formatUnits(userSupplied, 6), "USDC");

    if (userSupplied > 0 && totalSupplied > 0) {
        const userYield = (userSupplied * totalYield) / totalSupplied;
        console.log("User's Proportional Yield:", ethers.formatUnits(userYield, 6), "USDC");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

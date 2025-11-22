const hre = require("hardhat");
const { getAssetManagerFXRP } = require("../utils/getters");

async function main() {
    console.log("Deploying FlareVault to", hre.network.name);

    // Configuration
    let FXRP_ADDRESS;
    
    const provider = ethers.provider;
    
    if (hre.network.name === "coston2") {
        console.log("Network: Coston2 Testnet");
        const assetManager = await getAssetManagerFXRP(provider);
        FXRP_ADDRESS = await assetManager.fAsset();
        console.log("FXRP:", FXRP_ADDRESS);
        
    } else if (hre.network.name === "flare") {
        console.log("Network: Flare Mainnet");
        const assetManager = await getAssetManagerFXRP(provider);
        FXRP_ADDRESS = await assetManager.fAsset();
        console.log("FXRP:", FXRP_ADDRESS);

        USDC_ADDRESS = process.env.FLARE_USDC_ADDRESS;
        if (!USDC_ADDRESS) {
            throw new Error("FLARE_USDC_ADDRESS required for mainnet deployment");
        }
        console.log("USDC:", USDC_ADDRESS);
    } else {
        throw new Error("Unsupported network. Use --network coston2 or --network flare");
    }

    console.log("Deploying FlareVault...");

    const deployer = new ethers.Wallet(process.env.FLARE_DEPLOYER_PRIVATE_KEY, provider);
    console.log("Deployer:", deployer.address);
    
    // Use deployer address as operator
    const OPERATOR_ADDRESS = deployer.address;
    console.log("Operator:", OPERATOR_ADDRESS);

    const FlareVault = await ethers.getContractFactory("FlareVault", deployer);
    const vault = await FlareVault.deploy(
        FXRP_ADDRESS,
        OPERATOR_ADDRESS
    );
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    
    console.log("FlareVault:", vaultAddress);

    console.log("\nAdd to .env:");
    console.log(`FLARE_VAULT_ADDRESS=${vaultAddress}`);
    console.log(`FXRP_ADDRESS=${FXRP_ADDRESS}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

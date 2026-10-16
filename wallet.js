const express = require("express");
const cors = require("cors");
const userRoute = require("./Routes/userRoute");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();
const bodyParser = require("body-parser");
const { ethers } = require("ethers");

//wallet configration 

const provider = new ethers.JsonRpcProvider(process.env.BSC_PROVIDER_URL);

// تعريف ABI للتوكنات
const tokenABI = [
  "function transfer(address to, uint amount) public returns (bool)",
  "function decimals() public view returns (uint8)",
  "function balanceOf(address account) public view returns (uint256)",
];

const router = express.Router();

router.get("/wallet", (req, res) => {
    res.sendFile(path.join(__dirname, "./client/wallet.html"));
});


// إنشاء محفظة جديدة
router.post("/create-wallet", (req, res) => {
  const wallet = ethers.Wallet.createRandom();
  res.json({
    address: wallet.address,
    mnemonic: wallet.mnemonic.phrase,
    privateKey: wallet.privateKey,
  });
});

// استيراد محفظة باستخدام المفتاح الخاص
router.post("/import-wallet", (req, res) => {
  const { privateKey } = req.body;
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    res.json({ address: wallet.address });
  } catch (error) {
    res.status(400).json({ error: "Invalid private key" });
  }
});

// اختبار دالة decimals()
router.post("/test-decimals", async (req, res) => {
  const { tokenAddress } = req.body;

  try {
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, provider);
    const decimals = await tokenContract.decimals();
    res.json({ decimals: Number(decimals) });
  } catch (error) {
    res.status(500).json({ error: "Could not fetch decimals. Check the token address." });
  }
});

// إرسال التوكنات
router.post("/send-tokens", async (req, res) => {
  const { privateKey, tokenAddress, recipient, amount } = req.body;

  try {
    // إعداد المحفظة والعقد الذكي
    const wallet = new ethers.Wallet(privateKey, provider);
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);

    // الحصول على عدد الـ decimals
    const decimals = await tokenContract.decimals();

    // تحويل المبلغ إلى أصغر وحدة
    const value = ethers.parseUnits(amount.toString(), decimals);

    // تنفيذ المعاملة
    const tx = await tokenContract.transfer(recipient, value);
    await tx.wait();

    res.json({ status: "success", txHash: tx.hash });
  } catch (error) {
    console.error("Error during token transfer:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});


// عرض رصيد المحفظة
router.post("/get-balance", async (req, res) => {
    const { tokenAddress, walletAddress } = req.body;
  
    try {
      // إعداد العقد الذكي
      const tokenContract = new ethers.Contract(tokenAddress, tokenABI, provider);
  
      // الحصول على الرصيد
      const balance = await tokenContract.balanceOf(walletAddress);
  
      // تحويل الرصيد إلى تنسيق قابل للقراءة (بناءً على عدد الـ decimals)
      const decimals = await tokenContract.decimals();
      const readableBalance = ethers.formatUnits(balance, decimals);
  
      res.json({ balance: readableBalance });
    } catch (error) {
      console.error("Error fetching balance:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  module.exports = router;
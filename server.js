const express = require('express');
const cors = require('cors');
const path = require('path');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const axios = require('axios');
const FormDataNode = require('form-data');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || "admin123";
const JWT_SECRET = process.env.JWT_SECRET || (process.env.MONGO_URI || "aura_secret_key_2026").slice(0, 32);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPPORT_BOT_TOKEN = process.env.SUPPORT_BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 55 * 1024 * 1024 }
});

const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

async function verifyAdminAuth(req) {
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const tokenOrPin = bearerToken || (req.body && (req.body.token || req.body.pin)) || (req.query && req.query.token) || '';
  if (!tokenOrPin) return false;

  try {
    const decoded = jwt.verify(tokenOrPin, JWT_SECRET);
    if (decoded && decoded.role === 'admin') return true;
  } catch (e) {}

  try {
    const s = await Settings.findOne({ key: 'main' }).lean();
    const storedPin = (s && s.adminPin) ? s.adminPin : DEFAULT_ADMIN_PIN;
    if (storedPin.startsWith('$2a$') || storedPin.startsWith('$2b$')) {
      return await bcrypt.compare(String(tokenOrPin).trim(), storedPin);
    }
    return String(tokenOrPin).trim() === String(storedPin).trim();
  } catch (err) {
    return false;
  }
}

async function uploadToCloudinary(fileData, folder = 'aura_store') {
  if (!fileData) return "";
  if (typeof fileData === 'string' && (fileData.startsWith('http://') || fileData.startsWith('https://'))) {
    return fileData;
  }
  try {
    const result = await cloudinary.uploader.upload(fileData, {
      folder: folder,
      resource_type: 'auto'
    });
    return result.secure_url;
  } catch (err) {
    console.error('Cloudinary Upload Error:', err.message);
    return typeof fileData === 'string' ? fileData : "";
  }
}

function uploadBufferToCloudinary(buffer, folder = 'aura_store/delivery_slips') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

if (!MONGO_URI) {
  console.error('❌ CRITICAL: MONGO_URI is missing in Environment Variables!');
} else {
  mongoose.connect(MONGO_URI)
    .then(() => {
      console.log('✅ MongoDB Connected Successfully to aura_store');
      seedInitialData();
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err.message));
}

const categorySchema = new mongoose.Schema({
  name: { type: String, unique: true },
  subCategories: [String]
});

const productSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: String,
  mainCategory: String,
  category: String,
  price: Number,
  originalPrice: Number,
  costPrice: { type: Number, default: 0 },
  stockQuantity: Number,
  badge: String,
  rating: Number,
  reviewsCount: Number,
  inStock: Boolean,
  showOnHome: { type: Boolean, default: true },
  sizeOptions: [String],
  colorOptions: [String],
  images: [String],
  description: String,
  reviews: [
    {
      customerName: String,
      rating: Number,
      comment: String,
      photoUrl: { type: String, default: "" },
      date: String
    }
  ]
});

const bannerSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  productId: Number,
  title: String,
  tag: String,
  image: String
});

const couponSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  discountPercent: Number,
  minSpend: Number,
  expiresAt: { type: Number, default: 0 },
  title: String,
  description: String,
  showOnStore: Boolean
});

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  deliveryCharge: { type: Number, default: 0 },
  codAdvancePercent: { type: Number, default: 15 },
  maxCodOrderAmount: { type: Number, default: 2000 },
  freeGiftThreshold: { type: Number, default: 1499 },
  freeGiftTitle: { type: String, default: "Luxury Surprise Jewellery Box" },
  coinsEarnPercent: { type: Number, default: 5 },
  maxCoinsRedeemPerOrder: { type: Number, default: 200 },
  dealEndTime: { type: Number, default: 0 },
  adminPin: { type: String, default: "" },
  metaPixelId: { type: String, default: "" }
});

const orderSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  customerName: String,
  phone: String,
  address: String,
  pincode: String,
  city: String,
  state: String,
  items: Array,
  freeGiftUnlocked: { type: String, default: "" },
  subTotal: Number,
  discountApplied: Number,
  coinsUsed: { type: Number, default: 0 },
  coinsEarned: { type: Number, default: 0 },
  coinsCredited: { type: Boolean, default: false },
  deliveryCharge: Number,
  couponCode: String,
  total: Number,
  totalCost: { type: Number, default: 0 },
  netProfit: { type: Number, default: 0 },
  paymentMethod: String,
  advancePaid: Number,
  balanceDue: Number,
  utrNumber: String,
  status: String,
  courierPartner: String,
  awbNumber: String,
  deliverySlipFile: String,
  date: String,
  orderDateRaw: String,
  createdAt: { type: Date, default: Date.now }
});

const walletSchema = new mongoose.Schema({
  phone: { type: String, unique: true },
  customerName: String,
  coins: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

const abandonedCartSchema = new mongoose.Schema({
  phone: { type: String, unique: true },
  customerName: String,
  address: String,
  items: Array,
  totalAmount: Number,
  updatedAtStr: String,
  updatedAt: { type: Date, default: Date.now }
});

const supportTicketSchema = new mongoose.Schema({
  ticketId: { type: String, unique: true },
  orderId: String,
  customerName: String,
  phone: String,
  issueText: String,
  adminReply: { type: String, default: "" },
  repliedAt: { type: String, default: "" },
  createdAtStr: String,
  createdAt: { type: Date, default: Date.now }
});

const stockNotifySchema = new mongoose.Schema({
  productId: Number,
  productName: String,
  customerName: String,
  phone: String,
  createdAtStr: String,
  createdAt: { type: Date, default: Date.now }
});

const blockedNumberSchema = new mongoose.Schema({
  phone: { type: String, unique: true },
  reason: { type: String, default: "Blocked by Admin" },
  blockedAtStr: String,
  createdAt: { type: Date, default: Date.now }
});

const Category = mongoose.model('Category', categorySchema);
const Product = mongoose.model('Product', productSchema);
const Banner = mongoose.model('Banner', bannerSchema);
const Coupon = mongoose.model('Coupon', couponSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Order = mongoose.model('Order', orderSchema);
const Wallet = mongoose.model('Wallet', walletSchema);
const AbandonedCart = mongoose.model('AbandonedCart', abandonedCartSchema);
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
const StockNotify = mongoose.model('StockNotify', stockNotifySchema);
const BlockedNumber = mongoose.model('BlockedNumber', blockedNumberSchema);

const defaultCategories = [
  { name: "Men", subCategories: ["Shirts", "T-Shirts", "Watches", "Trousers", "Perfumes"] },
  { name: "Women", subCategories: ["Jhumka", "Studs", "Kurtis", "Sarees", "Handbags", "Bangles"] },
  { name: "Gifts", subCategories: ["Couples", "Romantic", "Gift Sets", "Customized Lamps"] }
];

const defaultBanners = [
  {
    id: 1,
    productId: 301,
    title: "Men's Luxury Oxford Royal Shirt",
    tag: "MEN'S SPECIAL • 50% SAVINGS",
    image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=60"
  },
  {
    id: 2,
    productId: 501,
    title: "Magnetic Mutual Heart Couple Bracelets Set",
    tag: "GF & BF SPECIAL • FLAT 50% OFF",
    image: "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=600&auto=format&fit=crop&q=60"
  }
];

const defaultCoupons = [
  {
    code: "DIWALI33",
    discountPercent: 33,
    minSpend: 499,
    expiresAt: 0,
    title: "Festive Special Offer",
    description: "Flat 33% OFF on orders above ₹499!",
    showOnStore: true
  },
  {
    code: "AURA20",
    discountPercent: 20,
    minSpend: 0,
    expiresAt: 0,
    title: "Mega Welcome Offer",
    description: "Flat 20% OFF on all orders.",
    showOnStore: true
  }
];

const defaultProducts = [
  {
    id: 301,
    name: "Men's Classic Oxford Cotton Shirt",
    mainCategory: "Men",
    category: "Shirts",
    price: 899,
    originalPrice: 1799,
    costPrice: 450,
    stockQuantity: 18,
    badge: "Bestseller",
    rating: 4.9,
    reviewsCount: 78,
    inStock: true,
    showOnHome: true,
    sizeOptions: ["M (38)", "L (40)", "XL (42)", "XXL (44)"],
    colorOptions: ["Pure White", "Sky Blue", "Navy Blue"],
    images: [
      "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=480&q=55"
    ],
    description: "100% breathable pure combed Oxford cotton with formal spread collar and double-stitched durability.",
    reviews: []
  },
  {
    id: 304,
    name: "Supima Heavyweight Minimalist Tee",
    mainCategory: "Men",
    category: "T-Shirts",
    price: 549,
    originalPrice: 1099,
    costPrice: 260,
    stockQuantity: 25,
    badge: "Must Have",
    rating: 4.9,
    reviewsCount: 88,
    inStock: true,
    showOnHome: true,
    sizeOptions: ["S", "M", "L", "XL", "XXL"],
    colorOptions: ["Pitch Black", "Pure White", "Sage Olive"],
    images: [
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=480&q=55"
    ],
    description: "240 GSM ultra-combed Supima cotton t-shirt with bio-wash finish and structured drop-shoulder fit.",
    reviews: []
  },
  {
    id: 307,
    name: "Royal Heritage Chronograph Master Watch",
    mainCategory: "Men",
    category: "Watches",
    price: 1899,
    originalPrice: 3999,
    costPrice: 900,
    stockQuantity: 4,
    badge: "Luxury Edition",
    rating: 5.0,
    reviewsCount: 94,
    inStock: true,
    showOnHome: true,
    sizeOptions: ["Standard (42mm Case)"],
    colorOptions: ["Obsidian Black", "Emerald Gold", "Silver Blue"],
    images: [
      "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=480&q=55"
    ],
    description: "Multi-dial functional quartz chronograph watch with anti-scratch sapphire crystal and surgical stainless steel casing.",
    reviews: []
  },
  {
    id: 401,
    name: "Royal Heritage Kundan Drop Jhumkas",
    mainCategory: "Women",
    category: "Jhumka",
    price: 699,
    originalPrice: 1299,
    costPrice: 310,
    stockQuantity: 3,
    badge: "Bestseller",
    rating: 4.9,
    reviewsCount: 142,
    inStock: true,
    showOnHome: true,
    sizeOptions: ["Standard (Height: 6.5 cm)"],
    colorOptions: ["22K Antique Gold", "Kundan Pearl White"],
    images: [
      "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=480&q=55"
    ],
    description: "22K micron gold plated traditional handcrafted earrings with real freshwater river seed pearls.",
    reviews: []
  },
  {
    id: 501,
    name: "Magnetic Mutual Heart Couple Bracelets Set",
    mainCategory: "Gifts",
    category: "Couples",
    price: 499,
    originalPrice: 999,
    costPrice: 210,
    stockQuantity: 28,
    badge: "Love Magnet",
    rating: 5.0,
    reviewsCount: 154,
    inStock: true,
    showOnHome: true,
    sizeOptions: ["Adjustable Size (Pair of 2)"],
    colorOptions: ["Matte Onyx & White Howlite", "All Black Cord"],
    images: [
      "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=480&q=55"
    ],
    description: "When brought close, the two heart halves automatically snap together via custom magnetic attraction bells.",
    reviews: []
  }
];

async function seedInitialData() {
  try {
    const catCount = await Category.countDocuments();
    if (catCount === 0) await Category.insertMany(defaultCategories);

    const productCount = await Product.countDocuments();
    if (productCount === 0) await Product.insertMany(defaultProducts);

    const bannerCount = await Banner.countDocuments();
    if (bannerCount === 0) await Banner.insertMany(defaultBanners);

    const couponCount = await Coupon.countDocuments();
    if (couponCount === 0) await Coupon.insertMany(defaultCoupons);

    const hashedDefaultPin = await bcrypt.hash(DEFAULT_ADMIN_PIN, 10);
    const existingSettings = await Settings.findOne({ key: 'main' });
    if (!existingSettings) {
      await Settings.create({
        key: 'main',
        deliveryCharge: 0,
        codAdvancePercent: 15,
        maxCodOrderAmount: 2000,
        freeGiftThreshold: 1499,
        freeGiftTitle: "Luxury Surprise Jewellery Box",
        coinsEarnPercent: 5,
        maxCoinsRedeemPerOrder: 200,
        dealEndTime: 0,
        adminPin: hashedDefaultPin,
        metaPixelId: ""
      });
    } else {
      let dirty = false;
      if (!existingSettings.adminPin) {
        existingSettings.adminPin = hashedDefaultPin;
        dirty = true;
      } else if (!existingSettings.adminPin.startsWith('$2a$') && !existingSettings.adminPin.startsWith('$2b$')) {
        existingSettings.adminPin = await bcrypt.hash(existingSettings.adminPin, 10);
        dirty = true;
      }
      if (existingSettings.maxCodOrderAmount === undefined) { existingSettings.maxCodOrderAmount = 2000; dirty = true; }
      if (existingSettings.freeGiftThreshold === undefined) { existingSettings.freeGiftThreshold = 1499; dirty = true; }
      if (existingSettings.coinsEarnPercent === undefined) { existingSettings.coinsEarnPercent = 5; dirty = true; }
      if (existingSettings.maxCoinsRedeemPerOrder === undefined) { existingSettings.maxCoinsRedeemPerOrder = 200; dirty = true; }
      if (dirty) await existingSettings.save();
    }
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}

function generateOrderInvoicePDF(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc.rect(40, 35, 515, 6).fill('#854d0e');

      doc.fillColor('#111827').fontSize(24).font('Helvetica-Bold').text('AURA FINE STORE', 40, 52);
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica').text('Premium Lifestyle, Ethnic Wear & Luxury Collections', 40, 78);
      doc.fillColor('#6b7280').fontSize(8).text('Bolpur, Birbhum, West Bengal - 731235 | Support: +91 6289145092', 40, 90);

      doc.roundedRect(365, 48, 190, 52, 6).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.fillColor('#b45309').fontSize(10).font('Helvetica-Bold').text('TAX INVOICE / BILL', 375, 56);
      doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold').text(`Order ID: #${order.id}`, 375, 70);
      doc.fillColor('#4b5563').fontSize(8).font('Helvetica').text(`Date: ${order.date}`, 375, 83);

      doc.moveTo(40, 114).lineTo(555, 114).strokeColor('#e5e7eb').lineWidth(1).stroke();

      doc.roundedRect(40, 126, 250, 96, 6).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#92400e').fontSize(8.5).font('Helvetica-Bold').text('BILLED & DELIVERED TO:', 50, 136);
      doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold').text(order.customerName || 'Valued Customer', 50, 150);
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica').text(`Phone: +91 ${order.phone}`, 50, 164);
      doc.fillColor('#4b5563').fontSize(8).text(order.address, 50, 177, { width: 230, lineGap: 1.5 });

      doc.roundedRect(305, 126, 250, 96, 6).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#92400e').fontSize(8.5).font('Helvetica-Bold').text('DISPATCH LOGISTICS:', 315, 136);
      doc.fillColor('#111827').fontSize(9.5).font('Helvetica-Bold').text('AURA Central Logistics Hub', 315, 150);
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica').text('Bolpur, Birbhum, WB - 731235', 315, 164);
      doc.fillColor('#374151').fontSize(8.5).text(`Courier Partner: ${order.courierPartner || 'Delhivery'}`, 315, 177);
      doc.fillColor('#4b5563').fontSize(8).text(`AWB / Tracking: ${order.awbNumber ? order.awbNumber : 'Post-Packing Dispatch'}`, 315, 190);

      const tableTop = 238;
      doc.roundedRect(40, tableTop, 515, 24, 3).fill('#2b1105');
      doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold');
      doc.text('SL', 52, tableTop + 7);
      doc.text('ITEM DESCRIPTION', 85, tableTop + 7);
      doc.text('UNIT PRICE', 335, tableTop + 7, { width: 70, align: 'right' });
      doc.text('QTY', 420, tableTop + 7, { width: 35, align: 'center' });
      doc.text('TOTAL', 470, tableTop + 7, { width: 75, align: 'right' });

      let currentY = tableTop + 30;

      (order.items || []).forEach((item, idx) => {
        doc.fillColor('#111827').fontSize(8.5).font('Helvetica').text(String(idx + 1), 52, currentY + 3);
        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9).text(item.name, 85, currentY);
        doc.fillColor('#92400e').font('Helvetica').fontSize(7.5).text(`Size: ${item.selectedSize || 'Standard'} | Color: ${item.selectedColor || 'Standard'}`, 85, currentY + 12);
        doc.fillColor('#111827').font('Helvetica').fontSize(8.5).text(`Rs. ${item.price}`, 335, currentY + 4, { width: 70, align: 'right' });
        doc.text(String(item.qty || 1), 420, currentY + 4, { width: 35, align: 'center' });
        doc.font('Helvetica-Bold').text(`Rs. ${(item.price || 0) * (item.qty || 1)}`, 470, currentY + 4, { width: 75, align: 'right' });

        currentY += 30;
        doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor('#f3f4f6').lineWidth(0.5).stroke();
        currentY += 4;
      });

      if (order.freeGiftUnlocked && order.freeGiftUnlocked.trim()) {
        doc.fillColor('#059669').fontSize(8.5).font('Helvetica-Bold').text(`FREE BONUS GIFT INCLUDED: ${order.freeGiftUnlocked.trim()} (Rs. 0.00)`, 40, currentY + 4, { width: 515 });
        currentY += 18;
      }

      const summaryY = Math.max(currentY + 15, 365);

      doc.roundedRect(40, summaryY, 250, 114, 6).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#92400e').fontSize(8.5).font('Helvetica-Bold').text('PAYMENT VERIFICATION:', 50, summaryY + 12);
      doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold').text(`Mode: ${order.paymentMethod}`, 50, summaryY + 28);

      const isPaid = order.paymentMethod === 'UPI';
      doc.fillColor('#059669').fontSize(8.5).font('Helvetica-Bold').text(
        isPaid ? 'Payment: 100% Fully Paid (Verified)' : `Advance Paid: Rs. ${order.advancePaid} (Balance Due: Rs. ${order.balanceDue})`,
        50, summaryY + 44
      );
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica').text(`Transaction UTR: ${order.utrNumber || 'N/A'}`, 50, summaryY + 62);
      doc.fillColor('#059669').fontSize(7.5).font('Helvetica-Oblique').text('* 100% Safe & Authenticated Order', 50, summaryY + 86);

      doc.roundedRect(305, summaryY, 250, 114, 6).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica');
      doc.text('Bag Subtotal:', 318, summaryY + 10);
      doc.font('Helvetica-Bold').text(`Rs. ${order.subTotal}`, 440, summaryY + 10, { width: 105, align: 'right' });

      doc.font('Helvetica').text('Coupon Discount:', 318, summaryY + 24);
      doc.fillColor('#059669').font('Helvetica-Bold').text(`- Rs. ${order.discountApplied || 0}`, 440, summaryY + 24, { width: 105, align: 'right' });

      doc.fillColor('#374151').font('Helvetica').text('AURA Coins Redeemed:', 318, summaryY + 38);
      doc.fillColor('#b45309').font('Helvetica-Bold').text(`- Rs. ${order.coinsUsed || 0}`, 440, summaryY + 38, { width: 105, align: 'right' });

      doc.fillColor('#374151').font('Helvetica').text('COD Delivery Charge:', 318, summaryY + 52);
      doc.fillColor(order.deliveryCharge > 0 ? '#111827' : '#059669').font('Helvetica-Bold').text(
        order.deliveryCharge > 0 ? `Rs. ${order.deliveryCharge}` : 'FREE',
        440, summaryY + 52, { width: 105, align: 'right' }
      );

      doc.roundedRect(305, summaryY + 75, 250, 39, 4).fill('#2b1105');
      doc.fillColor('#FFFFFF').fontSize(9.5).font('Helvetica-Bold');
      doc.text('TOTAL BILL AMOUNT:', 318, summaryY + 88);
      doc.fontSize(12).font('Helvetica-Bold').text(`Rs. ${order.total}`, 430, summaryY + 86, { width: 115, align: 'right' });

      const footerY = summaryY + 132;
      doc.moveTo(40, footerY - 8).lineTo(555, footerY - 8).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.fillColor('#111827').fontSize(8).font('Helvetica-Bold').text('TERMS & REPLACEMENT POLICY:', 40, footerY + 5);
      doc.fillColor('#4b5563').fontSize(7.5).font('Helvetica');
      doc.text('1. 7-Day Replacement: Report transit damage within 7 days of delivery.', 40, footerY + 18);
      doc.text('2. Please keep unboxing video for transit guarantee coverage.', 40, footerY + 28);

      doc.roundedRect(385, footerY, 170, 52, 6).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold').text('AURA FINE STORE', 385, footerY + 9, { width: 170, align: 'center' });
      doc.fillColor('#6b7280').fontSize(7.5).font('Helvetica').text('Digitally Verified Bill', 385, footerY + 22, { width: 170, align: 'center' });
      doc.fillColor('#b45309').fontSize(8).font('Helvetica-Bold').text('[ Authorized Signature ]', 385, footerY + 34, { width: 170, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function generateThermalShippingLabelPDF(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 6, size: [288, 432] });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const isCOD = order.paymentMethod === 'COD';
      const carrier = (order.courierPartner || 'Delhivery').toUpperCase();
      const trackingCode = String(order.awbNumber || order.id || 'AUR000000').toUpperCase();

      doc.rect(6, 6, 276, 420).lineWidth(2.0).strokeColor('#000000').stroke();
      doc.rect(9, 9, 270, 414).lineWidth(0.5).strokeColor('#000000').stroke();

      doc.rect(9, 9, 270, 38).fill('#000000');
      doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold').text('AURA FINE STORE', 15, 15);
      doc.fontSize(7).font('Helvetica').text('EXPRESS PARCEL • FRAGILE / HANDLE WITH CARE', 15, 32);

      doc.rect(208, 13, 66, 30).fill('#FFFFFF');
      doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold').text(isCOD ? 'COD' : 'PREPAID', 208, 17, { width: 66, align: 'center' });
      doc.fontSize(6.5).font('Helvetica').text(isCOD ? 'COLLECT CASH' : 'DO NOT COLLECT', 208, 31, { width: 66, align: 'center' });

      doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold').text(`CARRIER: ${carrier}`, 15, 53);
      doc.fontSize(8).font('Helvetica').text(`DATE: ${order.orderDateRaw || order.date || ''}`, 175, 53, { width: 98, align: 'right' });
      doc.fontSize(9.5).font('Helvetica-Bold').text(`ORDER ID: #${order.id}`, 15, 65);
      doc.fontSize(8.5).font('Helvetica-Bold').text(`AWB NO: ${order.awbNumber || 'AWAITING PICKUP'}`, 15, 78);

      let bx = 152;
      for (let i = 0; i < 42; i++) {
        const val = trackingCode.charCodeAt(i % trackingCode.length) * (i + 3);
        const bw = (val % 3 === 0) ? 2.2 : 1.0;
        if (bx + bw < 273) {
          doc.rect(bx, 64, bw, 24).fill('#000000');
          bx += bw + ((val % 2 === 0) ? 1.8 : 1.1);
        }
      }
      doc.fontSize(6.5).font('Helvetica-Bold').text(`*${trackingCode}*`, 150, 89, { width: 124, align: 'center' });

      doc.moveTo(9, 98).lineTo(279, 98).lineWidth(1.4).stroke();

      doc.fontSize(7.5).font('Helvetica-Bold').text('DELIVER TO (CUSTOMER DETAILS):', 15, 103);
      doc.fontSize(13).font('Helvetica-Bold').text((order.customerName || 'Valued Customer').toUpperCase(), 15, 114, { width: 258, lineBreak: false, ellipsis: true });
      doc.fontSize(11).font('Helvetica-Bold').text(`MOBILE: +91 ${order.phone}`, 15, 130);
      doc.fontSize(8.5).font('Helvetica').text(order.address || '', 15, 145, { width: 258, height: 52, lineGap: 1.8 });

      const gridY = 200;
      doc.rect(15, gridY, 108, 34).lineWidth(1.5).strokeColor('#000000').stroke();
      doc.fontSize(7).font('Helvetica-Bold').text('ROUTING PINCODE', 19, gridY + 4);
      doc.fontSize(15).font('Helvetica-Bold').text(String(order.pincode || '731235'), 19, gridY + 14);

      if (isCOD) {
        doc.rect(128, gridY, 145, 34).fill('#000000');
        doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text('COLLECT CASH FROM BUYER', 132, gridY + 5, { width: 137, align: 'center' });
        doc.fontSize(14).font('Helvetica-Bold').text(`Rs. ${order.balanceDue}/-`, 132, gridY + 15, { width: 137, align: 'center' });
      } else {
        doc.rect(128, gridY, 145, 34).lineWidth(1.5).strokeColor('#000000').stroke();
        doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold').text('PREPAID - ALREADY PAID', 132, gridY + 5, { width: 137, align: 'center' });
        doc.fontSize(13).font('Helvetica-Bold').text('COLLECT: Rs. 0/-', 132, gridY + 16, { width: 137, align: 'center' });
      }

      doc.moveTo(9, 241).lineTo(279, 241).lineWidth(1.4).stroke();

      doc.fillColor('#000000').rect(9, 241, 270, 15).fill('#e5e7eb');
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      doc.text('ITEM NAME & VARIANT (SIZE / COLOR)', 15, 245);
      doc.text('QTY', 246, 245, { width: 27, align: 'right' });

      let itemY = 260;
      const itemsList = (order.items || []).slice(0, 4);
      itemsList.forEach((item, idx) => {
        const desc = `${idx + 1}. ${item.name} (${item.selectedSize || 'Std'}, ${item.selectedColor || 'Std'})`;
        doc.fontSize(7.8).font('Helvetica').text(desc, 15, itemY, { width: 230, lineBreak: false, ellipsis: true });
        doc.font('Helvetica-Bold').text(String(item.qty || 1), 246, itemY, { width: 27, align: 'right' });
        itemY += 13;
      });

      if (order.freeGiftUnlocked) {
        doc.fontSize(7.8).font('Helvetica-Bold').text(`+ BONUS GIFT: ${order.freeGiftUnlocked}`, 15, itemY, { width: 230, lineBreak: false, ellipsis: true });
        doc.text('1', 246, itemY, { width: 27, align: 'right' });
      }

      doc.moveTo(9, 326).lineTo(279, 326).lineWidth(1.4).stroke();

      doc.fontSize(7.5).font('Helvetica-Bold').text('RETURN / SHIPPER ADDRESS (IF UNDELIVERED):', 15, 332);
      doc.fontSize(8.5).font('Helvetica-Bold').text('AURA Fine Store Central Dispatch Hub', 15, 343);
      doc.fontSize(7.5).font('Helvetica').text('Bolpur, Birbhum, West Bengal - 731235, India', 15, 354);
      doc.font('Helvetica-Bold').text('Helpline: +91 6289145092 | Weight: 0.50 Kg', 15, 365);

      doc.rect(9, 381, 270, 42).fill('#000000');
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text('IMPORTANT CUSTOMER NOTICE:', 15, 387);
      doc.fontSize(7).font('Helvetica').text('Record a continuous 360-degree unboxing video before opening the sealed package to claim 7-day replacement.', 15, 398, { width: 258 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function sendTelegramAlert(order) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const bonusLine = order.freeGiftUnlocked ? `\n🎀 <b>Free Gift Unlocked:</b> <b>${order.freeGiftUnlocked}</b>` : '';
  const coinsLine = order.coinsUsed > 0 ? `\n🪙 <b>AURA Coins Used:</b> -₹${order.coinsUsed}` : '';
  const captionText = `🧾 <b>AURA FINE STORE - NEW ORDER CONFIRMED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Order ID:</b> <code>#${order.id}</code>\n` +
    `👤 <b>Customer:</b> ${order.customerName}\n` +
    `📞 <b>Mobile:</b> <code>${order.phone}</code>\n` +
    `📍 <b>Address:</b> ${order.address}\n` +
    `💰 <b>Total Bill:</b> <b>₹${order.total}</b> (${order.paymentMethod})\n` +
    `📈 <b>Est. Net Profit:</b> <b>₹${order.netProfit || 0}</b>\n` +
    `🔑 <b>UTR:</b> <code>${order.utrNumber}</code>${coinsLine}${bonusLine}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Official PDF Invoice is attached below.</i>`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const pdfBuffer = await generateOrderInvoicePDF(order);
      const formData = new FormDataNode();
      formData.append('chat_id', TELEGRAM_CHAT_ID);
      formData.append('caption', captionText);
      formData.append('parse_mode', 'HTML');
      formData.append('document', pdfBuffer, {
        filename: `Invoice_${order.id}.pdf`,
        contentType: 'application/pdf'
      });

      const resp = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, formData, {
        headers: formData.getHeaders()
      });
      if (resp.data && resp.data.ok) return;
    } catch (err) {
      console.error(`Telegram attempt ${attempt} error:`, err.response ? err.response.data : err.message);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}

async function forwardSupportToTelegram(order, issueText, files) {
  if (!SUPPORT_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const itemsListText = (order.items || [])
      .map((item, idx) => `${idx + 1}. ${item.name} (${item.selectedSize || 'Std'}, ${item.selectedColor || 'Std'}) x${item.qty || 1}`)
      .join('\n');

    const msg = `🚨 <b>NEW SUPPORT COMPLAINT</b>\n━━━━━━━━━━━━━━━━━━━━\n📦 <b>Order ID:</b> <code>#${order.id}</code>\n👤 <b>Customer:</b> ${order.customerName}\n📞 <b>Mobile:</b> <code>+91 ${order.phone}</code>\n📍 <b>Address:</b> ${order.address}\n💰 <b>Bill:</b> ₹${order.total} (${order.paymentMethod})\n🛍️ <b>Items:</b>\n${itemsListText}\n━━━━━━━━━━━━━━━━━━━━\n⚠️ <b>PROBLEM:</b>\n<i>"${issueText}"</i>`;

    await axios.post(`https://api.telegram.org/bot${SUPPORT_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: msg,
      parse_mode: 'HTML'
    });

    if (files && files.photos && files.photos.length > 0) {
      for (let i = 0; i < files.photos.length; i++) {
        const f = files.photos[i];
        const pf = new FormDataNode();
        pf.append('chat_id', TELEGRAM_CHAT_ID);
        pf.append('caption', `📸 Photo ${i + 1} | Order #${order.id} (${order.customerName})`);
        pf.append('photo', f.buffer, { filename: f.originalname || `photo_${i + 1}.jpg`, contentType: f.mimetype || 'image/jpeg' });
        await axios.post(`https://api.telegram.org/bot${SUPPORT_BOT_TOKEN}/sendPhoto`, pf, {
          headers: pf.getHeaders(), maxBodyLength: Infinity, maxContentLength: Infinity
        });
      }
    }

    if (files && files.video && files.video[0]) {
      const v = files.video[0];
      const vf = new FormDataNode();
      vf.append('chat_id', TELEGRAM_CHAT_ID);
      vf.append('caption', `🎥 Video Proof | Order #${order.id} (${order.customerName})`);
      vf.append('document', v.buffer, { filename: v.originalname || 'proof_video.mp4', contentType: v.mimetype || 'video/mp4' });
      await axios.post(`https://api.telegram.org/bot${SUPPORT_BOT_TOKEN}/sendDocument`, vf, {
        headers: vf.getHeaders(), maxBodyLength: Infinity, maxContentLength: Infinity
      });
    }
  } catch (err) {
    console.error('❌ Direct Telegram Forward Error:', err.message);
  }
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// MANDATORY PAYMENT GATEWAY COMPLIANCE PAGES (Razorpay / Cashfree / PhonePe)
// =========================================================================
function renderCompliancePageHTML(pageTitle, activeSlug, contentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle} | AURA Fine Store</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
    .font-cinzel { font-family: 'Cinzel', serif; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #0c0a09; color: #f5f5f4; }
  </style>
</head>
<body class="min-h-screen flex flex-col justify-between">
  <div>
    <header class="bg-stone-950 border-b border-amber-500/25 py-4 px-4 sm:px-6 sticky top-0 z-40">
      <div class="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <a href="/" class="flex flex-col">
          <span class="text-2xl font-extrabold font-cinzel tracking-[0.22em] text-amber-100">AURA</span>
          <span class="text-[9px] uppercase tracking-[0.4em] text-amber-500 font-bold -mt-1">Fine Store</span>
        </a>
        <a href="/" class="bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold px-4 py-2 rounded-xl text-xs transition">
          <i class="fa-solid fa-arrow-left mr-1.5"></i> Back to Store
        </a>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div class="flex flex-wrap gap-2 mb-6 text-xs">
        <a href="/privacy-policy" class="px-3.5 py-1.5 rounded-full font-bold border ${activeSlug === 'privacy' ? 'bg-amber-500 text-stone-950 border-amber-400' : 'bg-stone-900 text-stone-300 border-stone-800 hover:border-amber-500/40'}">Privacy Policy</a>
        <a href="/terms-and-conditions" class="px-3.5 py-1.5 rounded-full font-bold border ${activeSlug === 'terms' ? 'bg-amber-500 text-stone-950 border-amber-400' : 'bg-stone-900 text-stone-300 border-stone-800 hover:border-amber-500/40'}">Terms & Conditions</a>
        <a href="/refund-policy" class="px-3.5 py-1.5 rounded-full font-bold border ${activeSlug === 'refund' ? 'bg-amber-500 text-stone-950 border-amber-400' : 'bg-stone-900 text-stone-300 border-stone-800 hover:border-amber-500/40'}">Refund & Cancellation</a>
        <a href="/shipping-policy" class="px-3.5 py-1.5 rounded-full font-bold border ${activeSlug === 'shipping' ? 'bg-amber-500 text-stone-950 border-amber-400' : 'bg-stone-900 text-stone-300 border-stone-800 hover:border-amber-500/40'}">Shipping Policy</a>
        <a href="/contact-us" class="px-3.5 py-1.5 rounded-full font-bold border ${activeSlug === 'contact' ? 'bg-amber-500 text-stone-950 border-amber-400' : 'bg-stone-900 text-stone-300 border-stone-800 hover:border-amber-500/40'}">Contact Us</a>
      </div>

      <article class="bg-stone-900/90 border border-amber-500/25 rounded-3xl p-6 sm:p-10 space-y-5 shadow-2xl">
        <div class="border-b border-stone-800 pb-4">
          <span class="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Official Store Compliance Document</span>
          <h1 class="text-2xl sm:text-3xl font-cinzel font-bold text-white mt-1">${pageTitle}</h1>
          <p class="text-xs text-stone-400 mt-1">Legal Entity: <strong>AURA Fine Store</strong> • Last Updated: November 2026</p>
        </div>
        <div class="space-y-4 text-sm text-stone-300 leading-relaxed">
          ${contentHtml}
        </div>
      </article>
    </main>
  </div>

  <footer class="bg-black border-t border-stone-900 py-8 px-4 text-xs text-stone-400">
    <div class="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
      <p>&copy; 2026 <strong>AURA Fine Store</strong> • Bolpur, Birbhum, West Bengal - 731235, India</p>
      <div class="flex flex-wrap justify-center gap-4">
        <a href="/privacy-policy" class="hover:text-amber-400">Privacy Policy</a>
        <a href="/terms-and-conditions" class="hover:text-amber-400">Terms & Conditions</a>
        <a href="/refund-policy" class="hover:text-amber-400">Refund & Cancellation</a>
        <a href="/shipping-policy" class="hover:text-amber-400">Shipping Policy</a>
        <a href="/contact-us" class="hover:text-amber-400">Contact Us</a>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

app.get('/privacy-policy', (req, res) => {
  res.send(renderCompliancePageHTML('Privacy Policy', 'privacy', `
    <p>At <strong>AURA Fine Store</strong>, protecting the privacy and personal data of our customers is our highest priority.</p>
    <h2 class="text-base font-bold text-amber-300 pt-2">1. Information We Collect</h2>
    <p>When you browse our catalog, place an order, or submit a support inquiry, we collect necessary contact and delivery details including your full name, 10-digit mobile number, email address, shipping address, postal pincode, and payment transaction reference (UTR).</p>
    <h2 class="text-base font-bold text-amber-300 pt-2">2. How We Use Your Information</h2>
    <ul class="list-disc pl-5 space-y-1.5">
      <li>To process, pack, and dispatch your orders via authorized courier partners (Delhivery, DTDC, Shiprocket, and IndiaPost).</li>
      <li>To send order confirmation invoices and shipment tracking updates.</li>
      <li>To prevent fraudulent transactions and maintain loyalty wallet balances.</li>
    </ul>
    <h2 class="text-base font-bold text-amber-300 pt-2">3. Payment & Data Security</h2>
    <p>We do <strong>not</strong> store any credit/debit card numbers or UPI PINs on our servers. All online payments are processed through encrypted, secure payment channels and verified UPI gateways.</p>
    <h2 class="text-base font-bold text-amber-300 pt-2">4. Contact for Privacy Queries</h2>
    <p>For data access, correction, or deletion requests, please email us at <strong>mahatosarita436@gmail.com</strong> or call <strong>+91 6289145092</strong>.</p>
  `));
});

app.get('/terms-and-conditions', (req, res) => {
  res.send(renderCompliancePageHTML('Terms & Conditions', 'terms', `
    <p>Welcome to <strong>AURA Fine Store</strong>. By accessing our website and purchasing products from our store, you agree to comply with and be bound by the following Terms & Conditions.</p>
    <h2 class="text-base font-bold text-amber-300 pt-2">1. Product Descriptions & Pricing</h2>
    <p>All prices listed on AURA Fine Store are in Indian Rupees (INR / ₹). We strive to display accurate product photographs, dimensions, variants, and pricing.</p>
    <h2 class="text-base font-bold text-amber-300 pt-2">2. Order Acceptance & Verification</h2>
    <p>All prepaid orders and Cash on Delivery (COD) advance token orders are subject to payment verification and stock availability. AURA Fine Store reserves the right to cancel any order in case of invalid transaction references or suspected fraudulent activity.</p>
    <h2 class="text-base font-bold text-amber-300 pt-2">3. Governing Law & Jurisdiction</h2>
    <p>These Terms & Conditions shall be governed by and construed in accordance with the laws of India. Any disputes arising shall be subject to the exclusive jurisdiction of the courts in <strong>Birbhum, West Bengal, India</strong>.</p>
  `));
});

app.get('/refund-policy', (req, res) => {
  res.send(renderCompliancePageHTML('Refund, Return & Cancellation Policy', 'refund', `
    <p>At <strong>AURA Fine Store</strong>, we inspect every item carefully before dispatch. Please review our transparent cancellation, replacement, and refund policy below:</p>
    <h2 class="text-base font-bold text-amber-300 pt-2">1. Order Cancellation Policy</h2>
    <ul class="list-disc pl-5 space-y-1.5">
      <li>Customers can request order cancellation <strong>before the parcel is dispatched/shipped</strong> from our warehouse by contacting our Help & Support Desk or calling <strong>+91 6289145092</strong>.</li>
      <li>Once an order has been handed over to the courier partner and an AWB tracking number is generated, it cannot be cancelled.</li>
      <li>For approved pre-dispatch cancellations on prepaid orders, a 100% refund is initiated within <strong>24–48 hours</strong>.</li>
    </ul>
    <h2 class="text-base font-bold text-amber-300 pt-2">2. 7-Day Easy Replacement Policy</h2>
    <p>If you receive a damaged, defective, or incorrect item, you must report the issue within <strong>7 days of delivery</strong> via our website's <em>Help & Support Desk</em>.</p>
    <div class="bg-amber-950/40 border border-amber-500/35 p-4 rounded-2xl text-amber-200 text-xs">
      <strong>Mandatory Unboxing Video Requirement:</strong> To protect against transit tampering, a continuous, uncut 360-degree parcel unboxing video showing the sealed shipping label clearly is mandatory for claiming a replacement or refund for damaged/missing items.
    </div>
    <h2 class="text-base font-bold text-amber-300 pt-2">3. Refund Processing Timeline</h2>
    <p>If a replacement unit is out of stock or a refund is approved after quality verification, the refund amount will be credited back to the customer's original payment method within <strong>5 to 7 business days</strong>.</p>
  `));
});

app.get('/shipping-policy', (req, res) => {
  res.send(renderCompliancePageHTML('Shipping & Delivery Policy', 'shipping', `
    <p><strong>AURA Fine Store</strong> delivers across India through trusted national courier networks.</p>
    <h2 class="text-base font-bold text-amber-300 pt-2">1. Order Processing & Dispatch Time</h2>
    <p>All confirmed orders are packed and dispatched from our central fulfillment hub in <strong>Bolpur, Birbhum, West Bengal - 731235</strong> within <strong>24 to 48 business hours</strong>.</p>
    <h2 class="text-base font-bold text-amber-300 pt-2">2. Estimated Delivery Timeline</h2>
    <ul class="list-disc pl-5 space-y-1.5">
      <li><strong>West Bengal & Eastern India:</strong> 3 to 5 business days after dispatch.</li>
      <li><strong>Rest of India (Metro & Tier 1/2 Cities):</strong> 5 to 7 business days after dispatch.</li>
    </ul>
    <h2 class="text-base font-bold text-amber-300 pt-2">3. Shipping Charges</h2>
    <p>আমরা সব প্রিপেইড অর্ডারে **ফ্রি স্ট্যান্ডার্ড শিপিং** দিই। ক্যাশ অন ডেলিভারি (COD)-র ক্ষেত্রে সামান্য হ্যান্ডলিং চার্জ প্রযোজ্য হতে পারে।</p>
  `));
});

app.get('/contact-us', (req, res) => {
  res.send(renderCompliancePageHTML('Contact Us & Merchant Details', 'contact', `
    <p>We are always happy to assist you with product inquiries, order tracking, bulk orders, or post-purchase support.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
      <div class="bg-stone-950 border border-stone-800 p-5 rounded-2xl space-y-2">
        <p class="text-xs font-bold uppercase text-amber-400"><i class="fa-solid fa-store mr-1.5"></i> Registered Business Name</p>
        <p class="text-base font-bold text-white">AURA Fine Store</p>
        <p class="text-xs text-stone-400">Artisanal Couture, Apparel, Jewellery & Lifestyle Retail</p>
      </div>
      <div class="bg-stone-950 border border-stone-800 p-5 rounded-2xl space-y-2">
        <p class="text-xs font-bold uppercase text-amber-400"><i class="fa-solid fa-location-dot mr-1.5"></i> Registered Office & Dispatch Address</p>
        <p class="text-sm font-semibold text-white">Bolpur (Kopai), District: Birbhum,<br>West Bengal - 731235, India</p>
      </div>
      <div class="bg-stone-950 border border-stone-800 p-5 rounded-2xl space-y-2">
        <p class="text-xs font-bold uppercase text-emerald-400"><i class="fa-solid fa-phone mr-1.5"></i> Customer Support Helpline & WhatsApp</p>
        <p class="text-base font-mono font-bold text-white">+91 6289145092</p>
        <p class="text-xs text-stone-400">Support Hours: Monday – Saturday, 10:00 AM to 7:00 PM IST</p>
      </div>
      <div class="bg-stone-950 border border-stone-800 p-5 rounded-2xl space-y-2">
        <p class="text-xs font-bold uppercase text-cyan-400"><i class="fa-solid fa-envelope mr-1.5"></i> Official Support Email</p>
        <p class="text-sm font-bold text-white">mahatosarita436@gmail.com</p>
        <p class="text-xs text-stone-400">Average response time: Within 4–6 business hours</p>
      </div>
    </div>
  `));
});

// Public Storefront Endpoint
app.get('/api/store', async (req, res) => {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });

    const [categories, dealBanners, rawProducts, coupons, settings] = await Promise.all([
      Category.find().lean(),
      Banner.find().lean(),
      Product.find().sort({ _id: -1 }).lean(),
      Coupon.find().lean(),
      Settings.findOne({ key: 'main' })
    ]);

    const products = rawProducts.map(({ costPrice, ...publicProd }) => publicProd);

    let activeSettings = settings
      ? {
          deliveryCharge: settings.deliveryCharge,
          codAdvancePercent: settings.codAdvancePercent,
          maxCodOrderAmount: settings.maxCodOrderAmount ?? 2000,
          freeGiftThreshold: settings.freeGiftThreshold ?? 1499,
          freeGiftTitle: settings.freeGiftTitle || "Luxury Surprise Jewellery Box",
          coinsEarnPercent: settings.coinsEarnPercent ?? 5,
          maxCoinsRedeemPerOrder: settings.maxCoinsRedeemPerOrder ?? 200,
          dealEndTime: settings.dealEndTime,
          metaPixelId: settings.metaPixelId || ""
        }
      : {
          deliveryCharge: 0,
          codAdvancePercent: 15,
          maxCodOrderAmount: 2000,
          freeGiftThreshold: 1499,
          freeGiftTitle: "Luxury Surprise Jewellery Box",
          coinsEarnPercent: 5,
          maxCoinsRedeemPerOrder: 200,
          dealEndTime: 0,
          metaPixelId: ""
        };

    if (activeSettings.dealEndTime && activeSettings.dealEndTime > 0 && Date.now() >= activeSettings.dealEndTime) {
      await Settings.findOneAndUpdate({ key: 'main' }, { dealEndTime: 0 });
      activeSettings.dealEndTime = 0;
    }

    res.json({ categories, dealBanners, products, coupons, storeSettings: activeSettings });
  } catch (err) {
    res.status(500).json({ success: false, message: "Database error" });
  }
});

app.get('/api/wallet/:phone', async (req, res) => {
  try {
    const cleanPhone = String(req.params.phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10) return res.json({ success: true, coins: 0 });
    const wallet = await Wallet.findOne({ phone: cleanPhone }).lean();
    res.json({ success: true, coins: wallet ? (wallet.coins || 0) : 0 });
  } catch (err) {
    res.json({ success: true, coins: 0 });
  }
});

// Blocked Numbers Endpoints
app.post('/api/admin/blocked-numbers', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const cleanPhone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: "Please enter a valid 10-digit mobile number!" });
    }
    const reason = String(req.body.reason || "Fake / RTO Customer").trim();
    const blockedAtStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    await BlockedNumber.findOneAndUpdate(
      { phone: cleanPhone },
      { phone: cleanPhone, reason, blockedAtStr, createdAt: new Date() },
      { upsert: true, new: true }
    );
    const blockedNumbers = await BlockedNumber.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, blockedNumbers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/blocked-numbers/:phone', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const cleanPhone = String(req.params.phone || '').replace(/[^0-9]/g, '');
    await BlockedNumber.deleteOne({ phone: cleanPhone });
    const blockedNumbers = await BlockedNumber.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, blockedNumbers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Order Placement with Block Check
app.post('/api/orders', async (req, res) => {
  try {
    const {
      customerName, phone, pincode, city, state,
      villageOrCity, houseNoStreet, postOffice, policeStation, landmark,
      items, couponCode, useAuraCoins,
      paymentMethod, utrNumber
    } = req.body;

    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: "Please enter a valid 10-digit mobile number!" });
    }

    const isBlocked = await BlockedNumber.findOne({ phone: cleanPhone }).lean();
    if (isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Sorry! Orders from this mobile number are restricted by store administration. Please contact +91 6289145092 for assistance."
      });
    }

    const cleanUtr = String(utrNumber || "").trim();
    if (!cleanUtr || cleanUtr.length < 8) {
      return res.status(400).json({ success: false, message: "Please enter a valid 12-digit UPI UTR number!" });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Your bag is empty!" });
    }

    const existingUtrOrder = await Order.findOne({ utrNumber: cleanUtr }).lean();
    if (existingUtrOrder) {
      return res.status(400).json({
        success: false,
        message: `Duplicate UTR detected! This UTR (${cleanUtr}) was already used for Order #${existingUtrOrder.id}.`
      });
    }

    const productIds = items.map(i => Number(i.id));
    const dbProducts = await Product.find({ id: { $in: productIds } });
    const prodMap = new Map(dbProducts.map(p => [p.id, p]));

    let verifiedSubTotal = 0;
    let verifiedTotalCost = 0;
    const verifiedItems = [];

    for (const cartItem of items) {
      const dbProd = prodMap.get(Number(cartItem.id));
      if (!dbProd) {
        return res.status(400).json({ success: false, message: `Product "${cartItem.name}" is no longer available.` });
      }
      const qty = Math.max(1, parseInt(cartItem.qty, 10) || 1);
      if ((dbProd.stockQuantity || 0) < qty) {
        return res.status(400).json({ success: false, message: `Insufficient stock for "${dbProd.name}". Only ${dbProd.stockQuantity} left.` });
      }

      verifiedSubTotal += dbProd.price * qty;
      verifiedTotalCost += (dbProd.costPrice || 0) * qty;

      verifiedItems.push({
        id: dbProd.id,
        name: dbProd.name,
        price: dbProd.price,
        costPrice: dbProd.costPrice || 0,
        selectedSize: cartItem.selectedSize || "Standard",
        selectedColor: cartItem.selectedColor || "Standard",
        qty,
        images: dbProd.images || []
      });
    }

    let verifiedDiscount = 0;
    let verifiedCouponCode = "None";
    if (couponCode && String(couponCode).trim()) {
      const cleanCode = String(couponCode).trim().toUpperCase();
      const dbCoupon = await Coupon.findOne({ code: cleanCode }).lean();
      if (dbCoupon) {
        if (dbCoupon.expiresAt && dbCoupon.expiresAt > 0 && Date.now() >= dbCoupon.expiresAt) {
          return res.status(400).json({ success: false, message: `Coupon "${cleanCode}" has expired!` });
        }
        if (verifiedSubTotal >= (dbCoupon.minSpend || 0)) {
          verifiedDiscount = Math.round((verifiedSubTotal * dbCoupon.discountPercent) / 100);
          verifiedCouponCode = dbCoupon.code;
        }
      }
    }

    const storeSettings = await Settings.findOne({ key: 'main' }).lean();
    const deliveryFeeSetting = storeSettings ? (storeSettings.deliveryCharge || 0) : 0;
    const codAdvancePctSetting = storeSettings ? (storeSettings.codAdvancePercent || 15) : 15;
    const maxCodLimit = storeSettings ? (storeSettings.maxCodOrderAmount ?? 2000) : 2000;
    const giftThreshold = storeSettings ? (storeSettings.freeGiftThreshold ?? 1499) : 1499;
    const giftTitle = storeSettings ? (storeSettings.freeGiftTitle || "Luxury Surprise Jewellery Box") : "Luxury Surprise Jewellery Box";
    const coinsEarnPct = storeSettings ? (storeSettings.coinsEarnPercent ?? 5) : 5;
    const maxCoinsRedeem = storeSettings ? (storeSettings.maxCoinsRedeemPerOrder ?? 200) : 200;

    let afterCouponValue = Math.max(1, verifiedSubTotal - verifiedDiscount);

    let verifiedCoinsUsed = 0;
    if (useAuraCoins && cleanPhone.length === 10) {
      const wallet = await Wallet.findOne({ phone: cleanPhone });
      if (wallet && wallet.coins > 0) {
        const redeemable = Math.min(wallet.coins, maxCoinsRedeem, Math.max(0, afterCouponValue - 1));
        if (redeemable > 0) {
          verifiedCoinsUsed = redeemable;
          wallet.coins -= redeemable;
          wallet.updatedAt = new Date();
          await wallet.save();
        }
      }
    }

    const netBagValue = Math.max(1, afterCouponValue - verifiedCoinsUsed);
    const normalizedMode = paymentMethod === 'COD' ? 'COD' : 'UPI';

    if (normalizedMode === 'COD' && maxCodLimit > 0 && netBagValue > maxCodLimit) {
      return res.status(400).json({
        success: false,
        message: `Cash on Delivery is disabled for orders above ₹${maxCodLimit}. Please select 100% Prepaid UPI!`
      });
    }

    const appliedDelivery = normalizedMode === 'COD' ? deliveryFeeSetting : 0;
    const verifiedFinalTotal = Math.max(1, netBagValue + appliedDelivery);
    const unlockedGift = (giftThreshold > 0 && netBagValue >= giftThreshold) ? giftTitle : "";
    const potentialCoinsEarned = coinsEarnPct > 0 ? Math.floor((netBagValue * coinsEarnPct) / 100) : 0;

    const verifiedAdvancePaid = normalizedMode === 'COD'
      ? Math.max(1, Math.round((verifiedFinalTotal * codAdvancePctSetting) / 100))
      : verifiedFinalTotal;
    const verifiedBalanceDue = verifiedFinalTotal - verifiedAdvancePaid;
    const estimatedNetProfit = netBagValue - verifiedTotalCost;

    for (const vItem of verifiedItems) {
      const p = prodMap.get(vItem.id);
      if (p) {
        p.stockQuantity = Math.max(0, (p.stockQuantity || 0) - vItem.qty);
        p.inStock = p.stockQuantity > 0;
        await p.save();
      }
    }

    const structuredAddress = `${houseNoStreet}, ${villageOrCity}, P.O: ${postOffice}${policeStation ? ', P.S: ' + policeStation : ''}${landmark ? ' (Landmark: ' + landmark + ')' : ''}, ${city}, ${state} - ${pincode}`;
    const orderId = 'AUR-' + Math.floor(100000 + Math.random() * 900000);
    const orderDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    const order = await Order.create({
      id: orderId,
      customerName,
      phone: cleanPhone,
      address: structuredAddress,
      pincode,
      city,
      state,
      items: verifiedItems,
      freeGiftUnlocked: unlockedGift,
      subTotal: verifiedSubTotal,
      discountApplied: verifiedDiscount,
      coinsUsed: verifiedCoinsUsed,
      coinsEarned: potentialCoinsEarned,
      coinsCredited: false,
      deliveryCharge: appliedDelivery,
      couponCode: verifiedCouponCode,
      total: verifiedFinalTotal,
      totalCost: verifiedTotalCost,
      netProfit: estimatedNetProfit,
      paymentMethod: normalizedMode,
      advancePaid: verifiedAdvancePaid,
      balanceDue: verifiedBalanceDue,
      utrNumber: cleanUtr,
      status: "Pending Verification",
      courierPartner: "Delhivery",
      awbNumber: "",
      deliverySlipFile: "",
      date: orderDate,
      orderDateRaw: todayStr
    });

    await AbandonedCart.deleteOne({ phone: cleanPhone }).catch(() => {});

    res.json({
      success: true,
      orderId: order.id,
      verifiedTotal: verifiedFinalTotal,
      coinsEarned: potentialCoinsEarned
    });

    sendTelegramAlert(order).catch(e => console.error("Background Telegram error:", e.message));
  } catch (err) {
    res.status(500).json({ success: false, message: "Order creation failed" });
  }
});

app.get('/api/orders/:id/invoice', async (req, res) => {
  try {
    const order = await Order.findOne({ id: req.params.id }).lean();
    if (!order) return res.status(404).send("Order not found");
    const pdfBuffer = await generateOrderInvoicePDF(order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="AURA_Invoice_${order.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).send("Failed to generate PDF invoice");
  }
});

app.get('/api/admin/orders/:id/shipping-label', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).send("Unauthorized");
    const order = await Order.findOne({ id: req.params.id }).lean();
    if (!order) return res.status(404).send("Order not found");
    const pdfBuffer = await generateThermalShippingLabelPDF(order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Label_4x6_${order.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).send("Failed to generate 4x6 shipping label");
  }
});

app.get('/api/orders/track', async (req, res) => {
  try {
    const query = (req.query.q || "").trim().toLowerCase();
    const cleanDigits = query.replace(/[^0-9]/g, '');
    const allOrders = await Order.find().sort({ createdAt: -1 }).lean();
    const matched = allOrders.filter(o =>
      o.id.toLowerCase() === query || (cleanDigits.length >= 6 && o.phone.includes(cleanDigits))
    );
    let walletCoins = 0;
    if (cleanDigits.length === 10) {
      const w = await Wallet.findOne({ phone: cleanDigits }).lean();
      walletCoins = w ? (w.coins || 0) : 0;
    }
    res.json({ success: true, orders: matched, walletCoins });
  } catch (err) {
    res.status(500).json({ success: false, orders: [], walletCoins: 0 });
  }
});

app.post('/api/admin/login', async (req, res) => {
  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const record = loginAttempts.get(clientIp);

  if (record && record.lockUntil && Date.now() < record.lockUntil) {
    const minsLeft = Math.ceil((record.lockUntil - Date.now()) / 60000);
    return res.status(429).json({
      success: false,
      message: `Too many wrong attempts! Locked for ${minsLeft} minute(s).`
    });
  }

  const { pin } = req.body;
  let isValid = false;
  try {
    const s = await Settings.findOne({ key: 'main' }).lean();
    const storedPin = (s && s.adminPin) ? s.adminPin : DEFAULT_ADMIN_PIN;
    if (storedPin.startsWith('$2a$') || storedPin.startsWith('$2b$')) {
      isValid = await bcrypt.compare(String(pin || '').trim(), storedPin);
    } else {
      isValid = String(pin || '').trim() === String(storedPin).trim();
    }
  } catch (e) {}

  if (isValid) {
    loginAttempts.delete(clientIp);
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ success: true, token });
  }

  const currentCount = (record ? record.count : 0) + 1;
  if (currentCount >= MAX_LOGIN_ATTEMPTS) {
    loginAttempts.set(clientIp, { count: currentCount, lockUntil: Date.now() + LOCKOUT_DURATION_MS });
    return res.status(429).json({
      success: false,
      message: "5 wrong attempts! Admin login locked for 5 minutes."
    });
  } else {
    loginAttempts.set(clientIp, { count: currentCount, lockUntil: null });
    return res.status(401).json({
      success: false,
      message: `Incorrect PIN! (${MAX_LOGIN_ATTEMPTS - currentCount} attempts remaining)`
    });
  }
});

app.post('/api/admin/orders', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });

    const [orders, coupons, settings, products, abandonedCarts, stockNotifies, categories, wallets, blockedNumbers] = await Promise.all([
      Order.find().sort({ createdAt: -1 }).lean(),
      Coupon.find().lean(),
      Settings.findOne({ key: 'main' }),
      Product.find().sort({ _id: -1 }).lean(),
      AbandonedCart.find().sort({ updatedAt: -1 }).lean(),
      StockNotify.find().sort({ createdAt: -1 }).lean(),
      Category.find().lean(),
      Wallet.find().sort({ coins: -1 }).lean(),
      BlockedNumber.find().sort({ createdAt: -1 }).lean()
    ]);

    let activeSettings = settings
      ? {
          deliveryCharge: settings.deliveryCharge,
          codAdvancePercent: settings.codAdvancePercent,
          maxCodOrderAmount: settings.maxCodOrderAmount ?? 2000,
          freeGiftThreshold: settings.freeGiftThreshold ?? 1499,
          freeGiftTitle: settings.freeGiftTitle || "Luxury Surprise Jewellery Box",
          coinsEarnPercent: settings.coinsEarnPercent ?? 5,
          maxCoinsRedeemPerOrder: settings.maxCoinsRedeemPerOrder ?? 200,
          dealEndTime: settings.dealEndTime,
          metaPixelId: settings.metaPixelId || ""
        }
      : {
          deliveryCharge: 0,
          codAdvancePercent: 15,
          maxCodOrderAmount: 2000,
          freeGiftThreshold: 1499,
          freeGiftTitle: "Luxury Surprise Jewellery Box",
          coinsEarnPercent: 5,
          maxCoinsRedeemPerOrder: 200,
          dealEndTime: 0,
          metaPixelId: ""
        };

    if (activeSettings.dealEndTime && activeSettings.dealEndTime > 0 && Date.now() >= activeSettings.dealEndTime) {
      await Settings.findOneAndUpdate({ key: 'main' }, { dealEndTime: 0 });
      activeSettings.dealEndTime = 0;
    }

    const activeOrders = orders.filter(o => o.status !== 'Cancelled');
    const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const todayOrders = activeOrders.filter(o => o.orderDateRaw === todayStr || (o.date && o.date.includes(todayStr)));
    const totalSales = activeOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalNetProfit = activeOrders.reduce((sum, o) => sum + (o.netProfit || 0), 0);
    const totalOnlineRevenue = activeOrders.filter(o => o.paymentMethod === 'UPI').reduce((sum, o) => sum + (o.total || 0), 0);
    const totalCodRevenue = activeOrders.filter(o => o.paymentMethod === 'COD').reduce((sum, o) => sum + (o.total || 0), 0);
    const lowStockProducts = products.filter(p => (p.stockQuantity || 0) < 3).map(p => ({ id: p.id, name: p.name, stockQuantity: p.stockQuantity || 0 }));

    res.json({
      success: true,
      orders,
      products,
      categories,
      coupons,
      abandonedCarts,
      stockNotifies,
      wallets,
      blockedNumbers,
      storeSettings: activeSettings,
      lowStockProducts,
      analytics: {
        totalOrders: orders.length,
        todayOrdersCount: todayOrders.length,
        totalSales,
        totalNetProfit,
        totalOnlineRevenue,
        totalCodRevenue,
        pendingOrders: orders.filter(o => o.status && o.status.includes('Pending')).length,
        lowStockCount: lowStockProducts.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/abandoned-carts/:phone', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    await AbandonedCart.deleteOne({ phone: req.params.phone });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.delete('/api/admin/orders/:id', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const orderId = req.params.id;
    const deleted = await Order.deleteOne({ id: orderId });
    if (deleted.deletedCount === 0) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, message: `Order #${orderId} deleted from MongoDB` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/admin/orders/:id/status', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const { status } = req.body;
    const order = await Order.findOne({ id: req.params.id });
    if (!order) return res.status(404).json({ success: false });

    const prevStatus = order.status;
    if (prevStatus !== 'Cancelled' && status === 'Cancelled') {
      for (const item of (order.items || [])) {
        const p = await Product.findOne({ id: item.id });
        if (p) {
          p.stockQuantity = (p.stockQuantity || 0) + (item.qty || 1);
          p.inStock = p.stockQuantity > 0;
          await p.save();
        }
      }
    } else if (prevStatus === 'Cancelled' && status !== 'Cancelled') {
      for (const item of (order.items || [])) {
        const p = await Product.findOne({ id: item.id });
        if (p) {
          p.stockQuantity = Math.max(0, (p.stockQuantity || 0) - (item.qty || 1));
          p.inStock = p.stockQuantity > 0;
          await p.save();
        }
      }
    }

    if (status === 'Delivered' && !order.coinsCredited && (order.coinsEarned || 0) > 0 && order.phone) {
      await Wallet.findOneAndUpdate(
        { phone: order.phone },
        {
          $setOnInsert: { phone: order.phone },
          $set: { customerName: order.customerName, updatedAt: new Date() },
          $inc: { coins: order.coinsEarned }
        },
        { upsert: true }
      );
      order.coinsCredited = true;
    }

    order.status = status;
    await order.save();
    res.json({ success: true, status: order.status });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/admin/orders/:id/dispatch-tracking', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const { courierPartner, awbNumber } = req.body;
    const order = await Order.findOneAndUpdate(
      { id: req.params.id },
      { courierPartner: courierPartner || "Delhivery", awbNumber, status: "Verified & Shipped" },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/admin/orders/:id/upload-slip', uploadMemory.single('slipFile'), async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    if (!req.file) return res.status(400).json({ success: false, message: "No slip file uploaded!" });

    const slipUrl = await uploadBufferToCloudinary(req.file.buffer, 'aura_store/delivery_slips');
    const order = await Order.findOneAndUpdate(
      { id: req.params.id },
      { deliverySlipFile: slipUrl },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, slipUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`🛍️ Store: http://localhost:${PORT}`);
  console.log(`🔒 Admin: http://localhost:${PORT}/admin`);
});

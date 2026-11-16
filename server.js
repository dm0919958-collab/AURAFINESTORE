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
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

if (!process.env.ADMIN_PIN) {
  console.warn('⚠️ SECURITY WARNING: ADMIN_PIN is not set in environment variables! Set ADMIN_PIN in Render.');
}
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ SECURITY WARNING: JWT_SECRET is not set! Using ephemeral cryptographic fallback.');
}

const DEFAULT_ADMIN_PIN = process.env.ADMIN_PIN || "AURA@9821";
const JWT_SECRET = process.env.JWT_SECRET || crypto.createHash('sha256').update(String(process.env.MONGO_URI || crypto.randomBytes(32).toString('hex'))).digest('hex');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPPORT_BOT_TOKEN = process.env.SUPPORT_BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

// Customer WhatsApp OTP login has been removed; checkout is guest-only.

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
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

// Customer 30-Day Persistent Session Token Verification
function getAuthenticatedCustomerPhone(req) {
  const authHeader = req.headers['x-customer-token'] || req.headers['authorization'] || '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : String(authHeader).trim();
  const queryToken = req.query && req.query.ctoken ? String(req.query.ctoken).trim() : '';
  const token = rawToken || queryToken;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.role === 'customer' && decoded.phone) {
      return String(decoded.phone).replace(/[^0-9]/g, '');
    }
  } catch (e) {}
  return null;
}

function maskCustomerAddress(addr) {
  if (!addr) return "";
  const parts = String(addr).split(',');
  if (parts.length <= 2) return addr;
  return `***, ${parts.slice(-2).join(',').trim()}`;
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
  nonRefundable: { type: Boolean, default: false },
  sizeOptions: [String],
  sizeStock: { type: mongoose.Schema.Types.Mixed, default: {} },
  variantStock: { type: mongoose.Schema.Types.Mixed, default: {} },
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
  refundWindowDays: { type: Number, default: 7 },
  dealEndTime: { type: Number, default: 0 },
  adminPin: { type: String, default: "" },
  metaPixelId: { type: String, default: "" },
  firstOrderPopupEnabled: { type: Boolean, default: true },
  firstOrderPopupTitle: { type: String, default: "Exclusive First-Order Privilege" },
  firstOrderPopupSubtitle: { type: String, default: "Unlock instant savings on your very first luxury order at AURA Fine Store!" },
  firstOrderPopupCoupon: { type: String, default: "AURA20" },
  firstOrderPopupImage: { type: String, default: "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=700&q=75" }
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
  coinsStatus: { type: String, default: "none" }, // none | pending_delivery | pending_refund_window | credited | forfeited
  coinsUnlockAt: { type: Number, default: 0 },
  isNonRefundableOrder: { type: Boolean, default: false },
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
  deliveredAt: { type: Date, default: null },
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

const Category = mongoose.model('Category', categorySchema);
const Product = mongoose.model('Product', productSchema);
const Banner = mongoose.model('Banner', bannerSchema);
const Coupon = mongoose.model('Coupon', couponSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Order = mongoose.model('Order', orderSchema);
const Wallet = mongoose.model('Wallet', walletSchema);
const AbandonedCart = mongoose.model('AbandonedCart', abandonedCartSchema);
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

const returnRequestSchema = new mongoose.Schema({
 requestId:{type:String,unique:true},orderId:{type:String,index:true},customerName:String,phone:{type:String,index:true},
 requestType:{type:String,enum:['Return','Replacement'],default:'Return'},productSummary:String,productDetails:String,orderTotal:String,shippingAddress:String,
 reason:String,details:String,status:{type:String,default:'Pending',index:true},adminNote:{type:String,default:''},
 telegramStatus:{type:String,default:'Pending'},telegramError:{type:String,default:''},photoCount:{type:Number,default:0},videoName:{type:String,default:''},
 createdAtStr:String,deliveredAt:Date,reviewedAt:{type:Date,default:null},cancelledAt:{type:Date,default:null}
},{timestamps:true});
const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);
const StockNotify = mongoose.model('StockNotify', stockNotifySchema);

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

function parseCleanStockMap(rawMap) {
  const map = {};
  if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
    for (const [k, v] of Object.entries(rawMap)) {
      const cleanK = String(k || '').trim();
      if (cleanK) map[cleanK] = Math.max(0, parseInt(v, 10) || 0);
    }
  }
  return map;
}

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
        metaPixelId: "",
        firstOrderPopupEnabled: true,
        firstOrderPopupTitle: "Exclusive First-Order Privilege",
        firstOrderPopupSubtitle: "Unlock instant savings on your very first luxury order at AURA Fine Store!",
        firstOrderPopupCoupon: "AURA20",
        firstOrderPopupImage: "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=700&q=75"
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
      if (existingSettings.firstOrderPopupEnabled === undefined) { existingSettings.firstOrderPopupEnabled = true; dirty = true; }
      if (!existingSettings.firstOrderPopupCoupon) { existingSettings.firstOrderPopupCoupon = "AURA20"; dirty = true; }
      if (dirty) await existingSettings.save();
    }
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}

// Automatically credit pending coins whose refund window has passed
async function processMaturedPendingCoins(phoneFilter = null) {
  try {
    const query = {
      status: 'Delivered',
      coinsCredited: false,
      coinsEarned: { $gt: 0 },
      coinsUnlockAt: { $gt: 0, $lte: Date.now() }
    };
    if (phoneFilter) query.phone = phoneFilter;

    const maturedOrders = await Order.find(query);
    for (const ord of maturedOrders) {
      if (ord.phone) {
        await Wallet.findOneAndUpdate(
          { phone: ord.phone },
          {
            $setOnInsert: { phone: ord.phone },
            $set: { customerName: ord.customerName, updatedAt: new Date() },
            $inc: { coins: ord.coinsEarned }
          },
          { upsert: true }
        );
      }
      ord.coinsCredited = true;
      ord.coinsStatus = 'credited';
      await ord.save();
    }
  } catch (e) {
    console.error('Mature coins sweep error:', e.message);
  }
}
setInterval(() => { processMaturedPendingCoins(); }, 10 * 60 * 1000);

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
      doc.fillColor('#6b7280').fontSize(8).text('Bolpur, Birbhum, West Bengal - 731204 | Support: +91 6289145092', 40, 90);

      doc.roundedRect(365, 48, 190, 52, 6).strokeColor('#e5e7eb').lineWidth(1).stroke();
      const isDelivered = order.status === 'Delivered';
      doc.fillColor(isDelivered ? '#047857' : '#b45309').fontSize(9.5).font('Helvetica-Bold').text(
        isDelivered ? 'FINAL DELIVERY INVOICE' : 'ORDER RECEIPT / BILL',
        375, 56, { width: 170 }
      );
      doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold').text(`Order ID: #${order.id}`, 375, 70);
      doc.fillColor('#4b5563').fontSize(8).font('Helvetica').text(`Order Date: ${order.date}`, 375, 83);

      doc.moveTo(40, 114).lineTo(555, 114).strokeColor('#e5e7eb').lineWidth(1).stroke();

      doc.roundedRect(40, 126, 250, 96, 6).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#92400e').fontSize(8.5).font('Helvetica-Bold').text('BILLED TO:', 50, 136);
      doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold').text(order.customerName || 'Valued Customer', 50, 150);
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica').text(`Phone: +91 ${order.phone}`, 50, 164);
      doc.fillColor('#4b5563').fontSize(8).text(order.address, 50, 177, { width: 230, lineGap: 1.5 });

      doc.roundedRect(305, 126, 250, 96, 6).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#92400e').fontSize(8.5).font('Helvetica-Bold').text('DISPATCH LOGISTICS:', 315, 136);
      doc.fillColor('#111827').fontSize(9.5).font('Helvetica-Bold').text('AURA Central Logistics Hub', 315, 150);
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica').text('Bolpur, Birbhum, WB - 731204', 315, 164);
      doc.fillColor('#374151').fontSize(8.5).text(`Courier Partner: ${order.courierPartner || 'Delhivery'}`, 315, 177);
      doc.fillColor('#4b5563').fontSize(8).text(`AWB / Tracking: ${order.awbNumber ? order.awbNumber : 'Post-Packing Dispatch'}`, 315, 190);
      doc.fillColor('#374151').fontSize(8).font('Helvetica-Bold').text(`Order Status: ${order.status || 'Pending Verification'}`, 315, 203);
      if (isDelivered && order.deliveredAt) {
        doc.fillColor('#047857').fontSize(8).font('Helvetica-Bold').text(`Delivered On: ${new Date(order.deliveredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 315, 215, { width: 230 });
      }

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
      doc.fillColor('#6b7280').fontSize(7.5).font('Helvetica').text(isDelivered ? 'Final Delivery Invoice' : 'Order Receipt - Delivery Pending', 385, footerY + 22, { width: 170, align: 'center' });
      doc.fillColor('#b45309').fontSize(8).font('Helvetica-Bold').text('[ Authorized Signature ]', 385, footerY + 34, { width: 170, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawThermalLabelPage(doc, order) {
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
  doc.fontSize(15).font('Helvetica-Bold').text(String(order.pincode || '731204'), 19, gridY + 14);

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
  doc.fontSize(7.5).font('Helvetica').text('Bolpur, Birbhum, West Bengal - 731204, India', 15, 354);
  doc.font('Helvetica-Bold').text('Helpline: +91 6289145092 | Weight: 0.50 Kg', 15, 365);

  doc.rect(9, 381, 270, 42).fill('#000000');
  doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text('IMPORTANT CUSTOMER NOTICE:', 15, 387);
  doc.fontSize(7).font('Helvetica').text('Record a continuous 360-degree unboxing video before opening the sealed package to claim 7-day replacement.', 15, 398, { width: 258 });
}

function generateThermalShippingLabelPDF(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 6, size: [288, 432] });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      drawThermalLabelPage(doc, order);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function generateBulkThermalShippingLabelsPDF(orders) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 6, size: [288, 432] });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      orders.forEach((order, idx) => {
        if (idx > 0) doc.addPage({ margin: 6, size: [288, 432] });
        drawThermalLabelPage(doc, order);
      });

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
    `<i>Order receipt PDF attached. Final delivery invoice will be sent when the order is marked Delivered.</i>`;

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

async function forwardReturnRequestToTelegram(order, request, files) {
 const token=SUPPORT_BOT_TOKEN||TELEGRAM_BOT_TOKEN;
 if(!token||!TELEGRAM_CHAT_ID)throw new Error('Telegram credentials missing: configure SUPPORT_BOT_TOKEN or TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Render.');
 const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const items=(order.items||[]).map((x,n)=>`${n+1}. ${esc(x.name)} | Qty: ${Number(x.qty)||1} | Size: ${esc(x.selectedSize||'—')} | Colour: ${esc(x.selectedColor||'—')}`).join('\n');
 const message=`↩️ <b>AURA FINE STORE — NEW ${esc(request.requestType).toUpperCase()} REQUEST</b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 <b>Request:</b> <code>${esc(request.requestId)}</code>\n📦 <b>Order:</b> <code>#${esc(order.id)}</code>\n👤 <b>Customer:</b> ${esc(order.customerName)}\n📞 <b>Phone:</b> <code>${esc(order.phone)}</code>\n📍 <b>Address:</b> ${esc(order.address||'Not available')}\n💰 <b>Order Total:</b> ₹${esc(order.total||'—')}\n🛍️ <b>Products:</b>\n${items}\n🔁 <b>Request Type:</b> ${esc(request.requestType)}\n📌 <b>Reason:</b> ${esc(request.reason)}\n📝 <b>Customer Details:</b>\n${esc(request.details)}\n📎 <b>Evidence:</b> ${request.photoCount} mandatory photo(s), video: ${esc(request.videoName||'—')}\n⏰ <b>Submitted:</b> ${esc(request.createdAtStr)}\n━━━━━━━━━━━━━━━━━━━━\n<i>Open AURA Admin Dashboard → Returns to review.</i>`;
 const msgResp=await axios.post(`https://api.telegram.org/bot${token}/sendMessage`,{chat_id:TELEGRAM_CHAT_ID,text:message,parse_mode:'HTML'},{timeout:30000});
 if(!msgResp.data?.ok)throw new Error(msgResp.data?.description||'Telegram sendMessage failed.');
 const sendMedia=async(method,file,caption,field)=>{
  const form=new FormDataNode();form.append('chat_id',TELEGRAM_CHAT_ID);form.append('caption',caption);form.append(field,file.buffer,{filename:file.originalname||'return-evidence',contentType:file.mimetype});
  const resp=await axios.post(`https://api.telegram.org/bot${token}/${method}`,form,{headers:form.getHeaders(),maxBodyLength:Infinity,maxContentLength:Infinity,timeout:120000});
  if(!resp.data?.ok)throw new Error(resp.data?.description||`Telegram ${method} failed.`);
 };
 for(let n=0;n<(files?.photos||[]).length;n++)await sendMedia('sendPhoto',files.photos[n],`Request ${request.requestId} • Order #${order.id} • Photo ${n+1}`,'photo');
 const video=files?.video?.[0];
 if(video){
  const caption=`Request ${request.requestId} • Order #${order.id} • Video evidence`;
  try{
   await sendMedia('sendVideo',video,caption,'video');
  }catch(videoErr){
   console.warn('Telegram sendVideo failed; retrying as document:',videoErr.response?.data?.description||videoErr.message);
   await sendMedia('sendDocument',video,caption,'document');
  }
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

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (
      origin.includes('aurafinestore.in') ||
      origin.endsWith('.onrender.com') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }
    return callback(new Error('CORS policy: Origin not allowed'), false);
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
          refundWindowDays: settings.refundWindowDays ?? 7,
          otpEnabled: false,
          dealEndTime: settings.dealEndTime,
          metaPixelId: settings.metaPixelId || "",
          firstOrderPopupEnabled: settings.firstOrderPopupEnabled !== false,
          firstOrderPopupTitle: settings.firstOrderPopupTitle || "Exclusive First-Order Privilege",
          firstOrderPopupSubtitle: settings.firstOrderPopupSubtitle || "Unlock instant savings on your very first luxury order at AURA Fine Store!",
          firstOrderPopupCoupon: settings.firstOrderPopupCoupon || "AURA20",
          firstOrderPopupImage: settings.firstOrderPopupImage || "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=700&q=75"
        }
      : {
          deliveryCharge: 0,
          codAdvancePercent: 15,
          maxCodOrderAmount: 2000,
          freeGiftThreshold: 1499,
          freeGiftTitle: "Luxury Surprise Jewellery Box",
          coinsEarnPercent: 5,
          maxCoinsRedeemPerOrder: 200,
          refundWindowDays: 7,
          otpEnabled: false,
          dealEndTime: 0,
          metaPixelId: "",
          firstOrderPopupEnabled: true,
          firstOrderPopupTitle: "Exclusive First-Order Privilege",
          firstOrderPopupSubtitle: "Unlock instant savings on your very first luxury order at AURA Fine Store!",
          firstOrderPopupCoupon: "AURA20",
          firstOrderPopupImage: "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=700&q=75"
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

// Customer Wallet Lookup (No customer login or OTP required)
app.get('/api/wallet/:phone', async (req, res) => {
  try {
    const cleanPhone = String(req.params.phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10) return res.json({ success: true, coins: 0, pendingCoins: 0, hasPriorOrders: false });

    await processMaturedPendingCoins(cleanPhone);

    const [wallet, priorOrder, pendingCoinOrders] = await Promise.all([
      Wallet.findOne({ phone: cleanPhone }).lean(),
      Order.findOne({ phone: cleanPhone, status: { $ne: 'Cancelled' } }).lean(),
      Order.find({ phone: cleanPhone, status: 'Delivered', coinsCredited: false, coinsEarned: { $gt: 0 } }).lean()
    ]);

    const pendingCoins = pendingCoinOrders.reduce((s, o) => s + (o.coinsEarned || 0), 0);

    res.json({
      success: true,
      coins: wallet ? (wallet.coins || 0) : 0,
      pendingCoins,
      hasPriorOrders: Boolean(priorOrder)
    });
  } catch (err) {
    res.json({ success: true, coins: 0, pendingCoins: 0, hasPriorOrders: false });
  }
});

app.post('/api/admin/categories', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Category name is required!" });

    const existing = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) return res.status(400).json({ success: false, message: "Category already exists!" });

    await Category.create({ name, subCategories: [] });
    const categories = await Category.find().lean();
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/categories/:name/subcategories', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const catName = req.params.name;
    const subName = String(req.body.subName || "").trim();
    if (!subName) return res.status(400).json({ success: false, message: "Sub-category name is required!" });

    const cat = await Category.findOne({ name: catName });
    if (!cat) return res.status(404).json({ success: false, message: "Main category not found!" });

    if (!cat.subCategories.some(s => s.toLowerCase() === subName.toLowerCase())) {
      cat.subCategories.push(subName);
      await cat.save();
    }
    const categories = await Category.find().lean();
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/categories/:name/subcategories/:subName', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const catName = req.params.name;
    const subName = req.params.subName;

    const cat = await Category.findOne({ name: catName });
    if (cat) {
      cat.subCategories = cat.subCategories.filter(s => s !== subName);
      await cat.save();
    }

    const prodsToDelete = await Product.find({ mainCategory: catName, category: subName }).lean();
    const prodIds = prodsToDelete.map(p => p.id);

    await Promise.all([
      Product.deleteMany({ mainCategory: catName, category: subName }),
      prodIds.length ? Banner.deleteMany({ productId: { $in: prodIds } }) : Promise.resolve()
    ]);

    const [categories, products] = await Promise.all([
      Category.find().lean(),
      Product.find().sort({ _id: -1 }).lean()
    ]);

    res.json({ success: true, deletedProductsCount: prodIds.length, categories, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/categories/:name', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const catName = req.params.name;

    const prodsToDelete = await Product.find({ mainCategory: catName }).lean();
    const prodIds = prodsToDelete.map(p => p.id);

    await Promise.all([
      Category.deleteOne({ name: catName }),
      Product.deleteMany({ mainCategory: catName }),
      prodIds.length ? Banner.deleteMany({ productId: { $in: prodIds } }) : Promise.resolve()
    ]);

    const [categories, products] = await Promise.all([
      Category.find().lean(),
      Product.find().sort({ _id: -1 }).lean()
    ]);

    res.json({ success: true, deletedProductsCount: prodIds.length, categories, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/recent-sales', async (req, res) => {
  try {
    const recentOrders = await Order.find({ status: { $ne: 'Cancelled' } })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    const feed = [];
    for (const o of recentOrders) {
      if (!o.items || !o.items.length) continue;
      const firstName = String(o.customerName || 'Customer').trim().split(/\s+/)[0];
      const city = String(o.city || 'India').trim();
      const item = o.items[0];
      feed.push({
        customerName: firstName,
        city,
        productId: item.id,
        productName: item.name,
        productImage: (item.images && item.images[0]) || ""
      });
    }
    res.json({ success: true, sales: feed });
  } catch (err) {
    res.json({ success: true, sales: [] });
  }
});

app.post('/api/products/:id/notify', async (req, res) => {
  try {
    const prodId = Number(req.params.id);
    const { customerName, phone } = req.body;
    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: "Please enter a valid 10-digit mobile number!" });
    }

    const product = await Product.findOne({ id: prodId }).lean();
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const existing = await StockNotify.findOne({ productId: prodId, phone: cleanPhone });
    if (existing) {
      return res.json({ success: true, message: "You are already on the priority WhatsApp restock list!" });
    }

    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    await StockNotify.create({
      productId: prodId,
      productName: product.name,
      customerName: (customerName || 'Customer').trim(),
      phone: cleanPhone,
      createdAtStr: nowStr
    });

    res.json({ success: true, message: "Saved! We will notify you on WhatsApp as soon as it is back in stock." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to save notification request." });
  }
});

app.delete('/api/admin/stock-notify/:id', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    await StockNotify.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/abandoned-cart', async (req, res) => {
  try {
    const { customerName, phone, address, items, totalAmount } = req.body;
    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10 || !items || items.length === 0) return res.json({ success: false });

    const updatedAtStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    await AbandonedCart.findOneAndUpdate(
      { phone: cleanPhone },
      {
        phone: cleanPhone,
        customerName: (customerName || 'Customer').trim(),
        address: (address || '').trim(),
        items,
        totalAmount: Number(totalAmount) || 0,
        updatedAtStr,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

const reviewRateMap = new Map();

app.post('/api/products/:id/reviews', async (req, res) => {
  try {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const recentTimes = (reviewRateMap.get(clientIp) || []).filter(t => now - t < 10 * 60 * 1000);
    if (recentTimes.length >= 2) {
      return res.status(429).json({
        success: false,
        message: "Too many reviews submitted! Please try again after 10 minutes."
      });
    }

    const { customerName, rating, comment, photoBase64 } = req.body;
    const prodId = Number(req.params.id);
    const product = await Product.findOne({ id: prodId });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    let uploadedPhotoUrl = "";
    if (photoBase64 && String(photoBase64).startsWith('data:image/')) {
      const approxBytes = Math.ceil((photoBase64.length * 3) / 4);
      if (approxBytes > 35 * 1024) {
        return res.status(400).json({
          success: false,
          message: "Review image exceeds 30 KB limit!"
        });
      }
      uploadedPhotoUrl = await uploadToCloudinary(photoBase64, 'aura_store/reviews');
    }

    const numRating = Math.min(5, Math.max(1, Number(rating) || 5));
    const reviewDate = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    if (!product.reviews) product.reviews = [];
    product.reviews.unshift({
      customerName: (customerName || "Verified Buyer").trim().slice(0, 50),
      rating: numRating,
      comment: (comment || "").trim().slice(0, 500),
      photoUrl: uploadedPhotoUrl,
      date: reviewDate
    });

    const oldTotal = (product.rating || 5) * (product.reviewsCount || 1);
    const newCount = (product.reviewsCount || 0) + 1;
    product.reviewsCount = newCount;
    product.rating = Number(((oldTotal + numRating) / newCount).toFixed(1));

    await product.save();
    recentTimes.push(now);
    reviewRateMap.set(clientIp, recentTimes);

    const { costPrice, ...safeProd } = product.toObject();
    res.json({ success: true, product: safeProd });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/products/:id/reviews/:reviewId', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });

    const prodId = Number(req.params.id);
    const reviewId = req.params.reviewId;
    const product = await Product.findOne({ id: prodId });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    product.reviews = (product.reviews || []).filter(r => String(r._id) !== String(reviewId));

    if (product.reviews.length > 0) {
      const sum = product.reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
      product.reviewsCount = product.reviews.length;
      product.rating = Number((sum / product.reviews.length).toFixed(1));
    } else {
      product.reviewsCount = 1;
      product.rating = 5.0;
    }

    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/support/search', async (req, res) => {
  try {
    const authedPhone = getAuthenticatedCustomerPhone(req);
    const rawPhone = String(req.query.phone || req.query.q || '').replace(/[^0-9]/g, '');
    const orderIdParam = String(req.query.orderId || '').trim().toUpperCase();

    const targetPhone = authedPhone || (rawPhone.length === 10 ? rawPhone : '');
    if (!targetPhone && !orderIdParam) {
      return res.json({ success: true, orders: [], tickets: [] });
    }

    // Require 10-digit phone (or verified customer token) so strangers cannot enumerate tickets by Order ID alone
    if (!targetPhone || targetPhone.length !== 10) {
      return res.status(400).json({
        success: false,
        message: "Please enter your registered 10-digit mobile number to access support.",
        orders: [],
        tickets: []
      });
    }

    const orderFilter = orderIdParam ? { phone: targetPhone, id: orderIdParam } : { phone: targetPhone };
    const ticketFilter = orderIdParam ? { phone: targetPhone, orderId: orderIdParam } : { phone: targetPhone };

    const returnFilter = orderIdParam ? { phone: targetPhone, orderId: orderIdParam } : { phone: targetPhone };
    const [matchedOrders, matchedTickets, matchedReturns] = await Promise.all([
      Order.find(orderFilter).sort({ createdAt: -1 }).limit(25).lean(),
      SupportTicket.find(ticketFilter).sort({ createdAt: -1 }).limit(25).lean(),
      ReturnRequest.find(returnFilter).sort({ createdAt: -1 }).limit(25).lean()
    ]);

    const safeOrders = matchedOrders.map(o => ({
      ...o,
      address: authedPhone === targetPhone ? o.address : maskCustomerAddress(o.address)
    }));

    res.json({ success: true, orders: safeOrders, tickets: matchedTickets, returnRequests: matchedReturns });
  } catch (err) {
    res.status(500).json({ success: false, orders: [], tickets: [] });
  }
});

app.post('/api/support/ticket', uploadMemory.fields([{ name: 'photos', maxCount: 6 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  try {
    const { orderId, issueText } = req.body;
    const order = await Order.findOne({ id: orderId }).lean();
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const ticketId = 'TKT-' + Math.floor(100000 + Math.random() * 900000);
    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    await SupportTicket.create({
      ticketId,
      orderId: order.id,
      customerName: order.customerName,
      phone: order.phone,
      issueText: (issueText || "").trim(),
      adminReply: "",
      repliedAt: "",
      createdAtStr: nowStr
    });

    res.json({ success: true, ticketId });
    forwardSupportToTelegram(order, (issueText || "").trim(), req.files);
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to submit support issue." });
  }
});

app.post('/api/support/return-request', uploadMemory.fields([{name:'photos',maxCount:6},{name:'video',maxCount:1}]), async(req,res)=>{
 try{
  const orderId=String(req.body.orderId||'').trim(),phone=String(req.body.phone||'').replace(/\D/g,''),requestType=String(req.body.requestType||'').trim(),reason=String(req.body.reason||'').trim(),details=String(req.body.details||'').trim();
  const reasons=['Damaged Product','Defective Product','Wrong Product Received','Missing Item','Size / Fit Issue','Other'];
  if(!orderId||phone.length!==10||!['Return','Replacement'].includes(requestType)||!reasons.includes(reason)||details.length<5)return res.status(400).json({success:false,message:'Please complete the request type, reason and description.'});
  const order=await Order.findOne({id:orderId,phone}).lean();if(!order)return res.status(404).json({success:false,message:'Order not found for this mobile number.'});
  if(order.status!=='Delivered'||!order.deliveredAt)return res.status(400).json({success:false,message:'Requests are available only after delivery.'});
  if(order.isNonRefundableOrder)return res.status(400).json({success:false,message:'This order is marked non-returnable under the product policy.'});
  const deliveredMs=new Date(order.deliveredAt).getTime(),windowMs=7*24*60*60*1000;
  if(!Number.isFinite(deliveredMs)||deliveredMs>Date.now()||Date.now()-deliveredMs>windowMs)return res.status(400).json({success:false,message:'The 7-day request window for this order has ended.'});
  const existing=await ReturnRequest.findOne({orderId:order.id,phone,status:{$ne:'Failed'}}).lean();
  if(existing)return res.status(409).json({success:false,message:'A request is already active for this order. A second Return or Replacement request is not allowed.'});
  const photos=(req.files&&req.files.photos)||[],video=(req.files&&req.files.video)||[];
  if(!photos.length)return res.status(400).json({success:false,message:'At least one product or parcel photo is mandatory.'});
  if(!video.length)return res.status(400).json({success:false,message:'A video evidence file is mandatory.'});
  if(photos.some(f=>f.size>10*1024*1024)||video.some(f=>f.size>20*1024*1024))return res.status(413).json({success:false,message:'Each photo must be 10 MB or smaller and the video must be 20 MB or smaller.'});
  if(photos.some(f=>!String(f.mimetype||'').startsWith('image/'))||video.some(f=>!String(f.mimetype||'').startsWith('video/')))return res.status(400).json({success:false,message:'Please upload valid image and video files only.'});
  const request={requestId:'RET-'+crypto.randomBytes(4).toString('hex').toUpperCase(),orderId:order.id,customerName:order.customerName,phone:order.phone,requestType,productSummary:(order.items||[]).map(x=>x.name).join(', ').slice(0,500),productDetails:(order.items||[]).map((x,n)=>`${n+1}. ${x.name} | Qty: ${Number(x.qty)||1} | Size: ${x.selectedSize||'—'} | Colour: ${x.selectedColor||'—'}`).join('\n').slice(0,2000),orderTotal:String(order.total||''),shippingAddress:String(order.address||''),reason,details:details.slice(0,2000),status:'Pending',adminNote:'',telegramStatus:'Pending',telegramError:'',photoCount:photos.length,videoName:video[0].originalname||'Video uploaded',createdAtStr:new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),deliveredAt:order.deliveredAt};
  await ReturnRequest.create(request);
  try{await forwardReturnRequestToTelegram(order,request,{photos,video});await ReturnRequest.updateOne({requestId:request.requestId},{$set:{telegramStatus:'Sent',telegramError:''}});}
  catch(telegramErr){console.error('Return Telegram delivery failed:',telegramErr.response?.data||telegramErr.message);await ReturnRequest.updateOne({requestId:request.requestId},{$set:{telegramStatus:'Failed',telegramError:String(telegramErr.response?.data?.description||telegramErr.message||'Telegram delivery failed').slice(0,500)}});}
  const latest=await ReturnRequest.findOne({requestId:request.requestId}).lean();
  res.json({success:true,requestId:request.requestId,telegramStatus:latest.telegramStatus,message:latest.telegramStatus==='Sent'?'Request submitted and evidence sent to Telegram.':'Request saved, but Telegram delivery failed. Admin can see the exact error in Returns dashboard.'});
 }catch(err){console.error('Return request submission failed:',err.response?.data||err.message);res.status(500).json({success:false,message:err.message||'Could not submit request.'});}
});

app.post('/api/support/return-request/:requestId/cancel',async(req,res)=>{
 try{
  const phone=String(req.body.phone||'').replace(/\D/g,'');
  const updated=await ReturnRequest.findOneAndUpdate({requestId:req.params.requestId,phone,status:'Pending'},{$set:{status:'Cancelled',cancelledAt:new Date(),adminNote:'Cancelled by customer'}},{new:true}).lean();
  if(!updated)return res.status(409).json({success:false,message:'This request can no longer be cancelled. Only Pending requests can be cancelled.'});
  res.json({success:true,request:updated,message:'Your request has been cancelled.'});
 }catch(err){res.status(500).json({success:false,message:'Could not cancel this request.'});}
});

app.post('/api/admin/returns/list',async(req,res)=>{
 try{if(!(await verifyAdminAuth(req)))return res.status(403).json({success:false,message:'Unauthorized'});const requests=await ReturnRequest.find({status:{$ne:'Failed'}}).sort({createdAt:-1}).limit(300).lean();res.json({success:true,requests});}
 catch(err){res.status(500).json({success:false,requests:[]});}
});
app.patch('/api/admin/returns/:requestId',async(req,res)=>{
 try{
  if(!(await verifyAdminAuth(req)))return res.status(403).json({success:false,message:'Unauthorized'});
  const allowed=['Pending','Approved','Return Approved','Replacement Approved','Rejected','Return In Transit','Received','Replacement Processing','Completed','Cancelled'],status=String(req.body.status||'').trim(),adminNote=String(req.body.adminNote||'').trim().slice(0,1000);
  if(!allowed.includes(status))return res.status(400).json({success:false,message:'Invalid return status.'});
  const updated=await ReturnRequest.findOneAndUpdate({requestId:req.params.requestId},{$set:{status,adminNote,reviewedAt:new Date()}},{new:true,runValidators:true}).lean();
  if(!updated)return res.status(404).json({success:false,message:'Return request not found.'});res.json({success:true,request:updated});
 }catch(err){res.status(500).json({success:false,message:'Could not update return request.'});}
});

app.delete('/api/admin/returns/:requestId',async(req,res)=>{
 try{
  if(!(await verifyAdminAuth(req)))return res.status(403).json({success:false,message:'Unauthorized'});
  const updated=await ReturnRequest.findOneAndUpdate({requestId:req.params.requestId,status:{$ne:'Failed'}},{$set:{status:'Failed',adminNote:'Request closed by admin. Customer may submit a new request.',reviewedAt:new Date()}},{new:true}).lean();
  if(!updated)return res.status(404).json({success:false,message:'Request not found or already deleted.'});
  res.json({success:true,request:updated,message:'Request removed from Admin list. Customer can submit again.'});
 }catch(err){res.status(500).json({success:false,message:'Could not delete return request.'});}
});

app.post('/api/admin/returns/bulk-delete',async(req,res)=>{
 try{
  if(!(await verifyAdminAuth(req)))return res.status(403).json({success:false,message:'Unauthorized'});
  const ids=Array.isArray(req.body.requestIds)?[...new Set(req.body.requestIds.map(v=>String(v).trim()).filter(Boolean))]:[];
  if(req.body.deleteAll===true){const result=await ReturnRequest.deleteMany({});return res.json({success:true,deletedCount:result.deletedCount||0,message:`Permanently deleted ${result.deletedCount||0} return/replacement records.`});}
  if(!ids.length||ids.length>300)return res.status(400).json({success:false,message:'Select between 1 and 300 requests.'});
  const result=await ReturnRequest.deleteMany({requestId:{$in:ids}});
  res.json({success:true,deletedCount:result.deletedCount||0,message:`Permanently deleted ${result.deletedCount||0} selected request(s).`});
 }catch(err){res.status(500).json({success:false,message:'Could not permanently delete selected requests.'});}
});

app.post('/api/admin/support/tickets', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const tickets = await SupportTicket.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, tickets });
  } catch (err) {
    res.status(500).json({ success: false, tickets: [] });
  }
});

app.post('/api/admin/support/reply', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const { ticketId, replyText } = req.body;
    const repliedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const updated = await SupportTicket.findOneAndUpdate(
      { ticketId },
      { adminReply: replyText.trim(), repliedAt },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Ticket not found" });
    res.json({ success: true, ticket: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/support/tickets/:ticketId', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    await SupportTicket.deleteOne({ ticketId: req.params.ticketId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post('/api/admin/products', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const { name, mainCategory, category, price, originalPrice, costPrice, stockQuantity, showOnHome, nonRefundable, sizeOptions, sizeStock, variantStock, colorOptions, badge, images, description } = req.body;

    const uploadedUrls = await Promise.all(
      (images || []).map(img => uploadToCloudinary(img, 'aura_store/products'))
    );

    const parsedVariantStock = parseCleanStockMap(variantStock);
    const parsedSizeStock = parseCleanStockMap(sizeStock);
    const vKeys = Object.keys(parsedVariantStock);
    const sKeys = Object.keys(parsedSizeStock);

    const finalTotalStock = vKeys.length > 0
      ? vKeys.reduce((sum, k) => sum + (Number(parsedVariantStock[k]) || 0), 0)
      : (sKeys.length > 0
          ? sKeys.reduce((sum, k) => sum + (Number(parsedSizeStock[k]) || 0), 0)
          : (Number(stockQuantity) || 0));

    const newProd = await Product.create({
      id: Date.now(),
      name,
      mainCategory,
      category,
      price: Number(price) || 0,
      originalPrice: Number(originalPrice) || Number(price) || 0,
      costPrice: Number(costPrice) || 0,
      stockQuantity: finalTotalStock,
      showOnHome: showOnHome !== false,
      nonRefundable: Boolean(nonRefundable),
      sizeOptions: sizeOptions || [],
      sizeStock: parsedSizeStock,
      variantStock: parsedVariantStock,
      colorOptions: colorOptions || [],
      badge: badge || "New",
      rating: 5.0,
      reviewsCount: 1,
      inStock: finalTotalStock > 0,
      images: uploadedUrls,
      description: description || "",
      reviews: []
    });
    res.json({ success: true, product: newProd });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/products/:id', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const { name, mainCategory, category, price, originalPrice, costPrice, stockQuantity, showOnHome, nonRefundable, sizeOptions, sizeStock, variantStock, colorOptions, badge, images, description } = req.body;

    const uploadedUrls = await Promise.all(
      (images || []).map(img => uploadToCloudinary(img, 'aura_store/products'))
    );

    const parsedVariantStock = parseCleanStockMap(variantStock);
    const parsedSizeStock = parseCleanStockMap(sizeStock);
    const vKeys = Object.keys(parsedVariantStock);
    const sKeys = Object.keys(parsedSizeStock);

    const finalTotalStock = vKeys.length > 0
      ? vKeys.reduce((sum, k) => sum + (Number(parsedVariantStock[k]) || 0), 0)
      : (sKeys.length > 0
          ? sKeys.reduce((sum, k) => sum + (Number(parsedSizeStock[k]) || 0), 0)
          : (Number(stockQuantity) || 0));

    const prodId = Number(req.params.id);
    const updated = await Product.findOneAndUpdate(
      { id: prodId },
      {
        name,
        mainCategory,
        category,
        price: Number(price),
        originalPrice: Number(originalPrice),
        costPrice: Number(costPrice) || 0,
        stockQuantity: finalTotalStock,
        showOnHome: showOnHome !== false,
        nonRefundable: Boolean(nonRefundable),
        sizeOptions,
        sizeStock: parsedSizeStock,
        variantStock: parsedVariantStock,
        colorOptions,
        badge,
        description,
        images: uploadedUrls,
        inStock: finalTotalStock > 0
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: "Product not found" });
    res.json({ success: true, product: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/admin/products/:id/quick-update', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const { price, costPrice, stockQuantity } = req.body;
    const prodId = Number(req.params.id);

    const updateFields = {};
    if (price !== undefined) updateFields.price = Math.max(0, Number(price));
    if (costPrice !== undefined) updateFields.costPrice = Math.max(0, Number(costPrice));
    if (stockQuantity !== undefined) {
      updateFields.stockQuantity = Math.max(0, Number(stockQuantity));
      updateFields.inStock = updateFields.stockQuantity > 0;
    }

    const updated = await Product.findOneAndUpdate({ id: prodId }, updateFields, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Product not found" });
    res.json({ success: true, product: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/admin/products/:id/toggle-home', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const { showOnHome } = req.body;
    const prodId = Number(req.params.id);
    const updated = await Product.findOneAndUpdate({ id: prodId }, { showOnHome: Boolean(showOnHome) }, { new: true });
    if (!updated) return res.status(404).json({ success: false });
    res.json({ success: true, product: updated });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.delete('/api/admin/products/:id', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const prodId = Number(req.params.id);
    await Promise.all([
      Product.deleteOne({ id: prodId }),
      Banner.deleteMany({ productId: prodId })
    ]);
    const products = await Product.find().sort({ _id: -1 }).lean();
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/banners/add', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const { title, tag, productId, image } = req.body;
    const bannerUrl = await uploadToCloudinary(image, 'aura_store/banners');

    await Banner.create({
      id: Date.now(),
      productId: Number(productId),
      title,
      tag,
      image: bannerUrl
    });
    const dealBanners = await Banner.find().lean();
    res.json({ success: true, dealBanners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/banners/:id', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    await Banner.deleteOne({ id: Number(req.params.id) });
    const dealBanners = await Banner.find().lean();
    res.json({ success: true, dealBanners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/coupons', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const { code, discountPercent, minSpend, validHours, validMinutes, title, description, showOnStore } = req.body;

    const cleanCode = (code || "").trim().toUpperCase();
    const h = Math.max(0, Number(validHours) || 0);
    const m = Math.max(0, Number(validMinutes) || 0);
    const durationMs = (h * 3600 + m * 60) * 1000;
    const expiresAt = durationMs > 0 ? (Date.now() + durationMs) : 0;

    await Coupon.findOneAndUpdate(
      { code: cleanCode },
      {
        code: cleanCode,
        discountPercent: Number(discountPercent) || 10,
        minSpend: Number(minSpend) || 0,
        expiresAt,
        title: title || `${cleanCode} Special Offer`,
        description: description || `Flat ${discountPercent}% OFF`,
        showOnStore: showOnStore === true || showOnStore === "true"
      },
      { upsert: true, new: true }
    );
    const coupons = await Coupon.find().lean();
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/coupons/:code', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    await Coupon.deleteOne({ code: req.params.code.toUpperCase() });
    const coupons = await Coupon.find().lean();
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Store Settings Endpoint (Includes First-Order Welcome Popup Photo & Config)
app.post('/api/admin/store-settings', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const {
      deliveryCharge, codAdvancePercent, maxCodOrderAmount,
      freeGiftThreshold, freeGiftTitle, coinsEarnPercent, maxCoinsRedeemPerOrder, refundWindowDays,
      dealEndTime, metaPixelId,
      firstOrderPopupEnabled, firstOrderPopupTitle, firstOrderPopupSubtitle, firstOrderPopupCoupon, firstOrderPopupImage
    } = req.body;

    const updateFields = {};
    if (deliveryCharge !== undefined) updateFields.deliveryCharge = Number(deliveryCharge) || 0;
    if (codAdvancePercent !== undefined) updateFields.codAdvancePercent = Number(codAdvancePercent) || 15;
    if (maxCodOrderAmount !== undefined) updateFields.maxCodOrderAmount = Math.max(0, Number(maxCodOrderAmount) || 0);
    if (freeGiftThreshold !== undefined) updateFields.freeGiftThreshold = Math.max(0, Number(freeGiftThreshold) || 0);
    if (freeGiftTitle !== undefined) updateFields.freeGiftTitle = String(freeGiftTitle || "Luxury Surprise Jewellery Box").trim();
    if (coinsEarnPercent !== undefined) updateFields.coinsEarnPercent = Math.max(0, Math.min(50, Number(coinsEarnPercent) || 0));
    if (maxCoinsRedeemPerOrder !== undefined) updateFields.maxCoinsRedeemPerOrder = Math.max(0, Number(maxCoinsRedeemPerOrder) || 0);
    if (refundWindowDays !== undefined) updateFields.refundWindowDays = Math.max(0, Math.min(60, Number(refundWindowDays) ?? 7));
    if (dealEndTime !== undefined) updateFields.dealEndTime = Number(dealEndTime) || 0;
    if (metaPixelId !== undefined) updateFields.metaPixelId = String(metaPixelId || "").trim();

    if (firstOrderPopupEnabled !== undefined) updateFields.firstOrderPopupEnabled = Boolean(firstOrderPopupEnabled);
    if (firstOrderPopupTitle !== undefined) updateFields.firstOrderPopupTitle = String(firstOrderPopupTitle || "Exclusive First-Order Privilege").trim();
    if (firstOrderPopupSubtitle !== undefined) updateFields.firstOrderPopupSubtitle = String(firstOrderPopupSubtitle || "").trim();
    if (firstOrderPopupCoupon !== undefined) updateFields.firstOrderPopupCoupon = String(firstOrderPopupCoupon || "").trim().toUpperCase();
    if (firstOrderPopupImage !== undefined && firstOrderPopupImage) {
      updateFields.firstOrderPopupImage = await uploadToCloudinary(firstOrderPopupImage, 'aura_store/banners');
    }

    const storeSettings = await Settings.findOneAndUpdate(
      { key: 'main' },
      updateFields,
      { upsert: true, new: true }
    ).lean();

    res.json({ success: true, storeSettings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/change-pin', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) {
      return res.status(403).json({ success: false, message: "Session expired or unauthorized!" });
    }
    const { newPin } = req.body;
    const cleanNew = String(newPin || "").trim();
    if (cleanNew.length < 4) {
      return res.status(400).json({ success: false, message: "New PIN must be at least 4 characters!" });
    }
    const hashedPin = await bcrypt.hash(cleanNew, 10);
    await Settings.findOneAndUpdate({ key: 'main' }, { adminPin: hashedPin }, { upsert: true });
    const newToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, token: newToken, message: "Admin PIN encrypted & updated successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Atomic Stock Deduction Helper with Rollback Support
async function atomicallyDeductStock(verifiedItems, prodMap) {
  const appliedOps = [];
  try {
    for (const vItem of verifiedItems) {
      const dbProd = prodMap.get(vItem.id);
      const varMap = (dbProd.variantStock && typeof dbProd.variantStock === 'object') ? dbProd.variantStock : {};
      const vKey = `${vItem.selectedColor}__${vItem.selectedSize}`;
      const sizeMap = (dbProd.sizeStock && typeof dbProd.sizeStock === 'object') ? dbProd.sizeStock : {};

      if (Object.keys(varMap).length > 0 && Object.prototype.hasOwnProperty.call(varMap, vKey)) {
        const updated = await Product.findOneAndUpdate(
          { id: vItem.id, [`variantStock.${vKey}`]: { $gte: vItem.qty } },
          { $inc: { [`variantStock.${vKey}`]: -vItem.qty, stockQuantity: -vItem.qty } },
          { new: true }
        );
        if (!updated) {
          throw new Error(`Sorry! "${vItem.name}" (${vItem.selectedColor}, Size: ${vItem.selectedSize}) just went out of stock.`);
        }
        if (updated.stockQuantity <= 0 && updated.inStock) {
          updated.stockQuantity = Math.max(0, updated.stockQuantity);
          updated.inStock = updated.stockQuantity > 0;
          await updated.save();
        }
        appliedOps.push({ type: 'variant', id: vItem.id, vKey, qty: vItem.qty });
      } else if (Object.keys(sizeMap).length > 0 && Object.prototype.hasOwnProperty.call(sizeMap, vItem.selectedSize)) {
        const updated = await Product.findOneAndUpdate(
          { id: vItem.id, [`sizeStock.${vItem.selectedSize}`]: { $gte: vItem.qty } },
          { $inc: { [`sizeStock.${vItem.selectedSize}`]: -vItem.qty, stockQuantity: -vItem.qty } },
          { new: true }
        );
        if (!updated) {
          throw new Error(`Sorry! Size "${vItem.selectedSize}" of "${vItem.name}" just went out of stock.`);
        }
        if (updated.stockQuantity <= 0 && updated.inStock) {
          updated.stockQuantity = Math.max(0, updated.stockQuantity);
          updated.inStock = updated.stockQuantity > 0;
          await updated.save();
        }
        appliedOps.push({ type: 'size', id: vItem.id, sz: vItem.selectedSize, qty: vItem.qty });
      } else {
        const updated = await Product.findOneAndUpdate(
          { id: vItem.id, stockQuantity: { $gte: vItem.qty } },
          { $inc: { stockQuantity: -vItem.qty } },
          { new: true }
        );
        if (!updated) {
          throw new Error(`Sorry! "${vItem.name}" just went out of stock.`);
        }
        if (updated.stockQuantity <= 0 && updated.inStock) {
          updated.inStock = false;
          await updated.save();
        }
        appliedOps.push({ type: 'total', id: vItem.id, qty: vItem.qty });
      }
    }
    return { ok: true, appliedOps };
  } catch (err) {
    // Rollback any already-deducted items in this batch
    for (const op of appliedOps) {
      if (op.type === 'variant') {
        await Product.findOneAndUpdate(
          { id: op.id },
          { $inc: { [`variantStock.${op.vKey}`]: op.qty, stockQuantity: op.qty }, $set: { inStock: true } }
        ).catch(() => {});
      } else if (op.type === 'size') {
        await Product.findOneAndUpdate(
          { id: op.id },
          { $inc: { [`sizeStock.${op.sz}`]: op.qty, stockQuantity: op.qty }, $set: { inStock: true } }
        ).catch(() => {});
      } else {
        await Product.findOneAndUpdate(
          { id: op.id },
          { $inc: { stockQuantity: op.qty }, $set: { inStock: true } }
        ).catch(() => {});
      }
    }
    return { ok: false, message: err.message };
  }
}

app.post('/api/orders', async (req, res) => {
  let deductedCoinsPhone = "";
  let deductedCoinsAmount = 0;

  try {
    const {
      customerName, phone, pincode, city, state,
      villageOrCity, houseNoStreet, postOffice, policeStation, landmark,
      items, couponCode, useAuraCoins,
      paymentMethod, utrNumber
    } = req.body;

    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: "Please enter a valid 10-digit Indian mobile number!" });
    }

    // Guest checkout: the customer enters a contact number; no OTP or customer login is required.
    const cleanUtr = String(utrNumber || "").trim();
    const isRepeatedDigits = /^(\d){11}$/.test(cleanUtr);
    const fakeUtrs = new Set(["123456789012", "123456123456", "987654321098", "012345678901"]);
    if (!/^\d{12}$/.test(cleanUtr) || isRepeatedDigits || fakeUtrs.has(cleanUtr)) {
      return res.status(400).json({ success: false, message: "Please enter a valid 12-digit numeric UPI UTR number!" });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Your bag is empty!" });
    }

    const pendingCount = await Order.countDocuments({ phone: cleanPhone, status: "Pending Verification" });
    if (pendingCount >= 2) {
      return res.status(400).json({
        success: false,
        message: "You already have 2 orders awaiting payment verification. Please wait for verification before placing another order."
      });
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
    let allItemsNonRefundable = true;

    for (const cartItem of items) {
      const dbProd = prodMap.get(Number(cartItem.id));
      if (!dbProd) {
        return res.status(400).json({ success: false, message: `Product "${cartItem.name}" is no longer available.` });
      }
      const qty = Math.max(1, parseInt(cartItem.qty, 10) || 1);
      const selSize = String(cartItem.selectedSize || "Standard").trim();
      const selColor = String(cartItem.selectedColor || "Standard").trim();

      if (!dbProd.nonRefundable) {
        allItemsNonRefundable = false;
      }

      verifiedSubTotal += dbProd.price * qty;
      verifiedTotalCost += (dbProd.costPrice || 0) * qty;

      verifiedItems.push({
        id: dbProd.id,
        name: dbProd.name,
        price: dbProd.price,
        costPrice: dbProd.costPrice || 0,
        nonRefundable: Boolean(dbProd.nonRefundable),
        selectedSize: selSize,
        selectedColor: selColor,
        qty,
        images: dbProd.images || []
      });
    }

    const storeSettings = await Settings.findOne({ key: 'main' }).lean();

    let verifiedDiscount = 0;
    let verifiedCouponCode = "None";
    if (couponCode && String(couponCode).trim()) {
      const cleanCode = String(couponCode).trim().toUpperCase();
      const firstOrderCode = storeSettings && storeSettings.firstOrderPopupEnabled && storeSettings.firstOrderPopupCoupon
        ? String(storeSettings.firstOrderPopupCoupon).trim().toUpperCase()
        : "";

      if (firstOrderCode && cleanCode === firstOrderCode) {
        const priorOrder = await Order.findOne({ phone: cleanPhone, status: { $ne: 'Cancelled' } }).lean();
        if (priorOrder) {
          return res.status(400).json({
            success: false,
            message: `Coupon "${cleanCode}" is strictly for First-Time Customers only! You have already placed an order (#${priorOrder.id}) with +91 ${cleanPhone}.`
          });
        }
      }

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

    const deliveryFeeSetting = storeSettings ? (storeSettings.deliveryCharge || 0) : 0;
    const codAdvancePctSetting = storeSettings ? (storeSettings.codAdvancePercent || 15) : 15;
    const maxCodLimit = storeSettings ? (storeSettings.maxCodOrderAmount ?? 2000) : 2000;
    const giftThreshold = storeSettings ? (storeSettings.freeGiftThreshold ?? 1499) : 1499;
    const giftTitle = storeSettings ? (storeSettings.freeGiftTitle || "Luxury Surprise Jewellery Box") : "Luxury Surprise Jewellery Box";
    const coinsEarnPct = storeSettings ? (storeSettings.coinsEarnPercent ?? 5) : 5;
    const maxCoinsRedeem = storeSettings ? (storeSettings.maxCoinsRedeemPerOrder ?? 200) : 200;

    let afterCouponValue = Math.max(1, verifiedSubTotal - verifiedDiscount);

    // Guest checkout can redeem available AURA Coins using the entered mobile number.
    let verifiedCoinsUsed = 0;
    if (useAuraCoins) {
      await processMaturedPendingCoins(cleanPhone);
      const wallet = await Wallet.findOne({ phone: cleanPhone }).lean();
      if (wallet && wallet.coins > 0) {
        const redeemable = Math.min(wallet.coins, maxCoinsRedeem, Math.max(0, afterCouponValue - 1));
        if (redeemable > 0) {
          // Atomically deduct coins only if sufficient balance exists
          const updatedWallet = await Wallet.findOneAndUpdate(
            { phone: cleanPhone, coins: { $gte: redeemable } },
            { $inc: { coins: -redeemable }, $set: { updatedAt: new Date() } },
            { new: true }
          );
          if (updatedWallet) {
            verifiedCoinsUsed = redeemable;
            deductedCoinsPhone = cleanPhone;
            deductedCoinsAmount = redeemable;
          }
        }
      }
    }

    const netBagValue = Math.max(1, afterCouponValue - verifiedCoinsUsed);
    const normalizedMode = paymentMethod === 'COD' ? 'COD' : 'UPI';

    if (normalizedMode === 'COD' && maxCodLimit > 0 && netBagValue > maxCodLimit) {
      if (deductedCoinsAmount > 0) {
        await Wallet.findOneAndUpdate({ phone: deductedCoinsPhone }, { $inc: { coins: deductedCoinsAmount } }).catch(() => {});
      }
      return res.status(400).json({
        success: false,
        message: `Cash on Delivery is disabled for orders above ₹${maxCodLimit}. Please select 100% Prepaid UPI!`
      });
    }

    // Atomically deduct stock across all items (prevents overselling under concurrent orders)
    const stockResult = await atomicallyDeductStock(verifiedItems, prodMap);
    if (!stockResult.ok) {
      if (deductedCoinsAmount > 0) {
        await Wallet.findOneAndUpdate({ phone: deductedCoinsPhone }, { $inc: { coins: deductedCoinsAmount } }).catch(() => {});
      }
      return res.status(400).json({ success: false, message: stockResult.message });
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

    const structuredAddress = `${houseNoStreet}, ${villageOrCity}, P.O: ${postOffice}${policeStation ? ', P.S: ' + policeStation : ''}${landmark ? ' (Landmark: ' + landmark + ')' : ''}, ${city}, ${state} - ${pincode}`;
    const orderId = 'AUR-' + Math.floor(100000 + Math.random() * 900000);
    const orderDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    const order = await Order.create({
      id: orderId,
      customerName: String(customerName || '').trim(),
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
      coinsStatus: potentialCoinsEarned > 0 ? "pending_delivery" : "none",
      coinsUnlockAt: 0,
      isNonRefundableOrder: allItemsNonRefundable,
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
      coinsEarned: potentialCoinsEarned,
      isNonRefundableOrder: allItemsNonRefundable
    });
    sendTelegramAlert(order).catch(e => console.error("Background Telegram error:", e.message));
  } catch (err) {
    if (deductedCoinsAmount > 0 && deductedCoinsPhone) {
      await Wallet.findOneAndUpdate({ phone: deductedCoinsPhone }, { $inc: { coins: deductedCoinsAmount } }).catch(() => {});
    }
    res.status(500).json({ success: false, message: "Order creation failed" });
  }
});

// Privacy-Protected PDF Invoice Download (Requires verified Customer Token or matching ?phone=)
app.get('/api/orders/:id/invoice', async (req, res) => {
  try {
    const order = await Order.findOne({ id: req.params.id }).lean();
    if (!order) return res.status(404).send("Order not found");

    const isAdmin = await verifyAdminAuth(req);
    const authedPhone = getAuthenticatedCustomerPhone(req);
    const queryPhone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    const verifiedPhone = authedPhone || queryPhone;

    if (!isAdmin && (!verifiedPhone || verifiedPhone !== String(order.phone || '').trim())) {
      return res.status(403).send("Unauthorized: Please verify your registered mobile number to download this invoice.");
    }

    const pdfBuffer = await generateOrderInvoicePDF(order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="AURA_Invoice_${order.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).send("Failed to generate PDF invoice");
  }
});

app.get('/api/admin/orders/bulk-shipping-labels', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).send("Unauthorized");
    const idsParam = String(req.query.ids || '').trim();
    const orderIds = idsParam.split(',').map(s => s.trim()).filter(Boolean);
    if (!orderIds.length) return res.status(400).send("No orders selected!");

    const orders = await Order.find({ id: { $in: orderIds } }).lean();
    if (!orders.length) return res.status(404).send("Selected orders not found!");

    const pdfBuffer = await generateBulkThermalShippingLabelsPDF(orders);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Bulk_Labels_4x6_${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).send("Failed to generate bulk 4x6 shipping labels");
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

// Privacy-Protected Order Tracking & Wallet View (Direct MongoDB Query + Address Masking)
app.get('/api/orders/track', async (req, res) => {
  try {
    const authedPhone = getAuthenticatedCustomerPhone(req);
    const rawQ = String(req.query.q || '').trim();
    const orderIdParam = String(req.query.orderId || '').trim().toUpperCase();
    const phoneParam = String(req.query.phone || '').replace(/[^0-9]/g, '');

    let targetPhone = authedPhone || (phoneParam.length === 10 ? phoneParam : '');
    let targetOrderId = orderIdParam;

    if (!targetPhone && !targetOrderId && rawQ) {
      const digits = rawQ.replace(/[^0-9]/g, '');
      if (digits.length === 10) targetPhone = digits;
      else if (rawQ.toUpperCase().startsWith('AUR-')) targetOrderId = rawQ.toUpperCase();
    }

    // Prevent tracking by Order ID alone without registered phone verification
    if (!targetPhone || targetPhone.length !== 10) {
      return res.status(400).json({
        success: false,
        message: "Please enter your registered 10-digit mobile number to track your orders.",
        orders: [],
        walletCoins: 0,
        pendingCoins: 0
      });
    }

    await processMaturedPendingCoins(targetPhone);

    const dbQuery = targetOrderId ? { phone: targetPhone, id: targetOrderId } : { phone: targetPhone };
    const matched = await Order.find(dbQuery).sort({ createdAt: -1 }).limit(30).lean();

    let walletCoins = 0;
    let pendingCoins = 0;
    {
      const w = await Wallet.findOne({ phone: targetPhone }).lean();
      walletCoins = w ? (w.coins || 0) : 0;
      pendingCoins = matched
        .filter(o => o.status === 'Delivered' && !o.coinsCredited && (o.coinsEarned || 0) > 0)
        .reduce((s, o) => s + (o.coinsEarned || 0), 0);
    }

    const safeOrders = matched.map(o => ({
      ...o,
      address: authedPhone === targetPhone ? o.address : maskCustomerAddress(o.address)
    }));

    res.json({ success: true, orders: safeOrders, walletCoins, pendingCoins });
  } catch (err) {
    res.status(500).json({ success: false, orders: [], walletCoins: 0, pendingCoins: 0 });
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
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
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

    const [orders, coupons, settings, products, abandonedCarts, stockNotifies, categories, wallets] = await Promise.all([
      Order.find().sort({ createdAt: -1 }).lean(),
      Coupon.find().lean(),
      Settings.findOne({ key: 'main' }),
      Product.find().sort({ _id: -1 }).lean(),
      AbandonedCart.find().sort({ updatedAt: -1 }).lean(),
      StockNotify.find().sort({ createdAt: -1 }).lean(),
      Category.find().lean(),
      Wallet.find().sort({ coins: -1 }).lean()
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
          refundWindowDays: settings.refundWindowDays ?? 7,
          otpEnabled: false,
          dealEndTime: settings.dealEndTime,
          metaPixelId: settings.metaPixelId || "",
          firstOrderPopupEnabled: settings.firstOrderPopupEnabled !== false,
          firstOrderPopupTitle: settings.firstOrderPopupTitle || "Exclusive First-Order Privilege",
          firstOrderPopupSubtitle: settings.firstOrderPopupSubtitle || "Unlock instant savings on your very first luxury order at AURA Fine Store!",
          firstOrderPopupCoupon: settings.firstOrderPopupCoupon || "AURA20",
          firstOrderPopupImage: settings.firstOrderPopupImage || "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=700&q=75"
        }
      : {
          deliveryCharge: 0,
          codAdvancePercent: 15,
          maxCodOrderAmount: 2000,
          freeGiftThreshold: 1499,
          freeGiftTitle: "Luxury Surprise Jewellery Box",
          coinsEarnPercent: 5,
          maxCoinsRedeemPerOrder: 200,
          refundWindowDays: 7,
          otpEnabled: false,
          dealEndTime: 0,
          metaPixelId: "",
          firstOrderPopupEnabled: true,
          firstOrderPopupTitle: "Exclusive First-Order Privilege",
          firstOrderPopupSubtitle: "Unlock instant savings on your very first luxury order at AURA Fine Store!",
          firstOrderPopupCoupon: "AURA20",
          firstOrderPopupImage: "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=700&q=75"
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

    const allowedStatuses = ['Pending Verification', 'Verified & Packing', 'Verified & Shipped', 'Delivered', 'Cancelled'];
    if (!allowedStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid order status' });

    const prevStatus = order.status;
    if (prevStatus !== 'Cancelled' && status === 'Cancelled') {
      for (const item of (order.items || [])) {
        const p = await Product.findOne({ id: item.id });
        if (p) {
          const varMap = (p.variantStock && typeof p.variantStock === 'object') ? { ...p.variantStock } : {};
          const vKey = `${item.selectedColor || 'Standard'}__${item.selectedSize || 'Standard'}`;
          const sizeMap = (p.sizeStock && typeof p.sizeStock === 'object') ? { ...p.sizeStock } : {};

          if (Object.keys(varMap).length > 0 && Object.prototype.hasOwnProperty.call(varMap, vKey)) {
            varMap[vKey] = (Number(varMap[vKey]) || 0) + (item.qty || 1);
            p.variantStock = varMap;
            p.markModified('variantStock');
            p.stockQuantity = Object.values(varMap).reduce((s, n) => s + (Number(n) || 0), 0);
          } else if (Object.keys(sizeMap).length > 0 && item.selectedSize && Object.prototype.hasOwnProperty.call(sizeMap, item.selectedSize)) {
            sizeMap[item.selectedSize] = (Number(sizeMap[item.selectedSize]) || 0) + (item.qty || 1);
            p.sizeStock = sizeMap;
            p.markModified('sizeStock');
            p.stockQuantity = Object.values(sizeMap).reduce((s, n) => s + (Number(n) || 0), 0);
          } else {
            p.stockQuantity = (p.stockQuantity || 0) + (item.qty || 1);
          }
          p.inStock = p.stockQuantity > 0;
          await p.save();
        }
      }
      // Reverse earned coins if already credited
      if (order.coinsCredited && (order.coinsEarned || 0) > 0 && order.phone) {
        const w = await Wallet.findOne({ phone: order.phone });
        if (w) {
          w.coins = Math.max(0, (w.coins || 0) - order.coinsEarned);
          await w.save();
        }
        order.coinsCredited = false;
      }
      if ((order.coinsEarned || 0) > 0) {
        order.coinsStatus = 'forfeited';
        order.coinsUnlockAt = 0;
      }
      // Refund customer's redeemed coins (coinsUsed) back to their Wallet when order is Cancelled
      if ((order.coinsUsed || 0) > 0 && order.phone) {
        await Wallet.findOneAndUpdate(
          { phone: order.phone },
          {
            $setOnInsert: { phone: order.phone },
            $set: { customerName: order.customerName, updatedAt: new Date() },
            $inc: { coins: order.coinsUsed }
          },
          { upsert: true }
        );
        order.coinsUsed = 0;
      }
    } else if (prevStatus === 'Cancelled' && status !== 'Cancelled') {
      for (const item of (order.items || [])) {
        const p = await Product.findOne({ id: item.id });
        if (p) {
          const varMap = (p.variantStock && typeof p.variantStock === 'object') ? { ...p.variantStock } : {};
          const vKey = `${item.selectedColor || 'Standard'}__${item.selectedSize || 'Standard'}`;
          const sizeMap = (p.sizeStock && typeof p.sizeStock === 'object') ? { ...p.sizeStock } : {};

          if (Object.keys(varMap).length > 0 && Object.prototype.hasOwnProperty.call(varMap, vKey)) {
            varMap[vKey] = Math.max(0, (Number(varMap[vKey]) || 0) - (item.qty || 1));
            p.variantStock = varMap;
            p.markModified('variantStock');
            p.stockQuantity = Object.values(varMap).reduce((s, n) => s + (Number(n) || 0), 0);
          } else if (Object.keys(sizeMap).length > 0 && item.selectedSize && Object.prototype.hasOwnProperty.call(sizeMap, item.selectedSize)) {
            sizeMap[item.selectedSize] = Math.max(0, (Number(sizeMap[item.selectedSize]) || 0) - (item.qty || 1));
            p.sizeStock = sizeMap;
            p.markModified('sizeStock');
            p.stockQuantity = Object.values(sizeMap).reduce((s, n) => s + (Number(n) || 0), 0);
          } else {
            p.stockQuantity = Math.max(0, (p.stockQuantity || 0) - (item.qty || 1));
          }
          p.inStock = p.stockQuantity > 0;
          await p.save();
        }
      }
    }

    if (status === 'Delivered' && !order.coinsCredited && (order.coinsEarned || 0) > 0 && order.phone) {
      const storeCfg = await Settings.findOne({ key: 'main' }).lean();
      const refundDays = storeCfg ? (storeCfg.refundWindowDays ?? 7) : 7;

      // Non-Refundable orders (or 0-day refund window) credit coins IMMEDIATELY on delivery;
      // Refundable orders unlock coins automatically after the refund window passes.
      if (order.isNonRefundableOrder || refundDays <= 0) {
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
        order.coinsStatus = 'credited';
        order.coinsUnlockAt = Date.now();
      } else {
        order.coinsStatus = 'pending_refund_window';
        order.coinsUnlockAt = Date.now() + (refundDays * 24 * 60 * 60 * 1000);
      }
    }

    order.status = status;
    if (status === 'Delivered') {
      if (prevStatus !== 'Delivered' || !order.deliveredAt) order.deliveredAt = new Date();
    } else {
      order.deliveredAt = null;
    }
    await order.save();
    res.json({ success: true, status: order.status, deliveredAt: order.deliveredAt });
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

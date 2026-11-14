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
const JWT_SECRET = process.env.JWT_SECRET || (MONGO_URI_FALLBACK_SECRET = (process.env.MONGO_URI || "aura_secret_key_2026").slice(0, 32));
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
  title: String,
  description: String,
  showOnStore: Boolean
});

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  deliveryCharge: { type: Number, default: 0 },
  codAdvancePercent: { type: Number, default: 15 },
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
  giftNote: { type: String, default: "" },
  subTotal: Number,
  discountApplied: Number,
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

const Product = mongoose.model('Product', productSchema);
const Banner = mongoose.model('Banner', bannerSchema);
const Coupon = mongoose.model('Coupon', couponSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Order = mongoose.model('Order', orderSchema);
const AbandonedCart = mongoose.model('AbandonedCart', abandonedCartSchema);
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

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
    title: "Festive Special Offer",
    description: "Flat 33% OFF on orders above ₹499!",
    showOnStore: true
  },
  {
    code: "AURA20",
    discountPercent: 20,
    minSpend: 0,
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
    stockQuantity: 10,
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
    stockQuantity: 14,
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
        dealEndTime: 0,
        adminPin: hashedDefaultPin,
        metaPixelId: ""
      });
    } else if (!existingSettings.adminPin) {
      existingSettings.adminPin = hashedDefaultPin;
      await existingSettings.save();
    } else if (!existingSettings.adminPin.startsWith('$2a$') && !existingSettings.adminPin.startsWith('$2b$')) {
      existingSettings.adminPin = await bcrypt.hash(existingSettings.adminPin, 10);
      await existingSettings.save();
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
      doc.fillColor('#6b7280').fontSize(8).text('Bolpur, Birbhum, West Bengal - 731204 | Support: +91 6289145092', 40, 90);

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
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica').text('Bolpur, Birbhum, WB - 731204', 315, 164);
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

      if (order.giftNote && order.giftNote.trim()) {
        doc.fillColor('#92400e').fontSize(8.5).font('Helvetica-Bold').text(`Free Gift Message: "${order.giftNote.trim()}"`, 40, currentY + 6, { width: 515 });
        currentY += 22;
      }

      const summaryY = Math.max(currentY + 15, 360);

      doc.roundedRect(40, summaryY, 250, 108, 6).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#92400e').fontSize(8.5).font('Helvetica-Bold').text('PAYMENT VERIFICATION:', 50, summaryY + 12);
      doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold').text(`Mode: ${order.paymentMethod}`, 50, summaryY + 28);

      const isPaid = order.paymentMethod === 'UPI';
      doc.fillColor('#059669').fontSize(8.5).font('Helvetica-Bold').text(
        isPaid ? 'Payment: 100% Fully Paid (Verified)' : `Advance Paid: Rs. ${order.advancePaid} (Balance Due: Rs. ${order.balanceDue})`,
        50, summaryY + 44
      );
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica').text(`Transaction UTR: ${order.utrNumber || 'N/A'}`, 50, summaryY + 62);
      doc.fillColor('#059669').fontSize(7.5).font('Helvetica-Oblique').text('* 100% Safe & Authenticated Order', 50, summaryY + 84);

      doc.roundedRect(305, summaryY, 250, 108, 6).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica');
      doc.text('Bag Subtotal:', 318, summaryY + 12);
      doc.font('Helvetica-Bold').text(`Rs. ${order.subTotal}`, 440, summaryY + 12, { width: 105, align: 'right' });

      doc.font('Helvetica').text('Coupon Discount:', 318, summaryY + 26);
      doc.fillColor('#059669').font('Helvetica-Bold').text(`- Rs. ${order.discountApplied || 0}`, 440, summaryY + 26, { width: 105, align: 'right' });

      doc.fillColor('#374151').font('Helvetica').text('COD Delivery Charge:', 318, summaryY + 40);
      doc.fillColor(order.deliveryCharge > 0 ? '#111827' : '#059669').font('Helvetica-Bold').text(
        order.deliveryCharge > 0 ? `Rs. ${order.deliveryCharge}` : 'FREE',
        440, summaryY + 40, { width: 105, align: 'right' }
      );

      doc.fillColor('#6b7280').font('Helvetica').text('GST & Taxes Included:', 318, summaryY + 54);
      doc.text('Rs. 0.00', 440, summaryY + 54, { width: 105, align: 'right' });

      doc.roundedRect(305, summaryY + 71, 250, 37, 4).fill('#2b1105');
      doc.fillColor('#FFFFFF').fontSize(9.5).font('Helvetica-Bold');
      doc.text('TOTAL BILL AMOUNT:', 318, summaryY + 84);
      doc.fontSize(12).font('Helvetica-Bold').text(`Rs. ${order.total}`, 430, summaryY + 82, { width: 115, align: 'right' });

      const footerY = summaryY + 125;
      doc.moveTo(40, footerY - 8).lineTo(555, footerY - 8).strokeColor('#e5e7eb').stroke();
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

// 4x6 Inch Thermal Shipping Label PDF Generator (288 x 432 points)
function generateThermalShippingLabelPDF(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 14, size: [288, 432] });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc.rect(10, 10, 268, 412).lineWidth(1.5).strokeColor('#000000').stroke();

      // Top Header
      doc.rect(10, 10, 268, 38).fill('#000000');
      doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold').text('AURA FINE STORE', 18, 17);
      doc.fontSize(8).font('Helvetica').text('PRIORITY EXPRESS PARCEL', 18, 33);
      doc.fontSize(10).font('Helvetica-Bold').text(order.paymentMethod === 'COD' ? 'COD' : 'PREPAID', 210, 22, { width: 60, align: 'right' });

      // Order & Courier Bar
      doc.fillColor('#000000').fontSize(9).font('Helvetica-Bold').text(`ORDER: #${order.id}`, 18, 56);
      doc.fontSize(8.5).font('Helvetica').text(`Courier: ${order.courierPartner || 'Delhivery'}`, 18, 69);
      doc.fontSize(8.5).font('Helvetica-Bold').text(`AWB: ${order.awbNumber || 'PENDING DISPATCH'}`, 18, 81);
      doc.moveTo(10, 96).lineTo(278, 96).lineWidth(1).stroke();

      // Deliver To Box
      doc.fontSize(8.5).font('Helvetica-Bold').text('DELIVER TO:', 18, 104);
      doc.fontSize(12).font('Helvetica-Bold').text(order.customerName || 'Customer', 18, 117);
      doc.fontSize(10).font('Helvetica-Bold').text(`MOB: +91 ${order.phone}`, 18, 133);
      doc.fontSize(8.5).font('Helvetica').text(order.address || '', 18, 149, { width: 252, lineGap: 2 });

      doc.rect(18, 210, 140, 24).fill('#f3f4f6');
      doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold').text(`PIN: ${order.pincode || ''}`, 24, 217);

      // COD Collect Banner
      if (order.paymentMethod === 'COD') {
        doc.rect(164, 210, 106, 24).fill('#000000');
        doc.fillColor('#FFFFFF').fontSize(9.5).font('Helvetica-Bold').text(`COLLECT: Rs.${order.balanceDue}`, 168, 217, { width: 98, align: 'center' });
      } else {
        doc.rect(164, 210, 106, 24).strokeColor('#000000').stroke();
        doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold').text('PAID: Rs.0 DUE', 168, 217, { width: 98, align: 'center' });
      }

      doc.moveTo(10, 244).lineTo(278, 244).lineWidth(1).stroke();

      // Package Contents
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold').text('PACKAGE CONTENTS:', 18, 252);
      let itemY = 265;
      (order.items || []).slice(0, 4).forEach((item, idx) => {
        doc.fontSize(8).font('Helvetica').text(
          `${idx + 1}. ${item.name} (${item.selectedSize || 'Std'}) x${item.qty || 1}`,
          18, itemY, { width: 252, lineBreak: false }
        );
        itemY += 13;
      });

      doc.moveTo(10, 326).lineTo(278, 326).lineWidth(1).stroke();

      // Return / Shipper Address
      doc.fontSize(7.5).font('Helvetica-Bold').text('RETURN / SHIPPER ADDRESS (IF UNDELIVERED):', 18, 334);
      doc.fontSize(7.5).font('Helvetica').text('AURA Fine Store Hub, Bolpur, Birbhum, West Bengal - 731204', 18, 345, { width: 252 });
      doc.text('Customer Care: +91 6289145092', 18, 366);

      doc.moveTo(10, 382).lineTo(278, 382).lineWidth(1).stroke();
      doc.fontSize(8).font('Helvetica-Bold').text('HANDLE WITH CARE • RECORD UNBOXING VIDEO', 10, 395, { width: 268, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function sendTelegramAlert(order) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const giftLine = order.giftNote ? `\n🎁 <b>Gift Message:</b> <i>"${order.giftNote}"</i>` : '';
  const captionText = `🧾 <b>AURA FINE STORE - NEW ORDER CONFIRMED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>Order ID:</b> <code>#${order.id}</code>\n` +
    `👤 <b>Customer:</b> ${order.customerName}\n` +
    `📞 <b>Mobile:</b> <code>${order.phone}</code>\n` +
    `📍 <b>Address:</b> ${order.address}\n` +
    `💰 <b>Total Bill:</b> <b>₹${order.total}</b> (${order.paymentMethod})\n` +
    `📈 <b>Est. Net Profit:</b> <b>₹${order.netProfit || 0}</b>\n` +
    `🔑 <b>UTR:</b> <code>${order.utrNumber}</code>${giftLine}\n` +
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

// Public Storefront Endpoint (hides costPrice from customers)
app.get('/api/store', async (req, res) => {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });

    const [dealBanners, rawProducts, coupons, settings] = await Promise.all([
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
          dealEndTime: settings.dealEndTime,
          metaPixelId: settings.metaPixelId || ""
        }
      : { deliveryCharge: 0, codAdvancePercent: 15, dealEndTime: 0, metaPixelId: "" };

    if (activeSettings.dealEndTime && activeSettings.dealEndTime > 0 && Date.now() >= activeSettings.dealEndTime) {
      await Settings.findOneAndUpdate({ key: 'main' }, { dealEndTime: 0 });
      activeSettings.dealEndTime = 0;
    }

    res.json({ dealBanners, products, coupons, storeSettings: activeSettings });
  } catch (err) {
    res.status(500).json({ success: false, message: "Database error" });
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

app.post('/api/products/:id/reviews', async (req, res) => {
  try {
    const { customerName, rating, comment } = req.body;
    const prodId = Number(req.params.id);
    const product = await Product.findOne({ id: prodId });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const numRating = Math.min(5, Math.max(1, Number(rating) || 5));
    const reviewDate = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    if (!product.reviews) product.reviews = [];
    product.reviews.unshift({
      customerName: (customerName || "Verified Buyer").trim(),
      rating: numRating,
      comment: (comment || "").trim(),
      date: reviewDate
    });

    const oldTotal = (product.rating || 5) * (product.reviewsCount || 1);
    const newCount = (product.reviewsCount || 0) + 1;
    product.reviewsCount = newCount;
    product.rating = Number(((oldTotal + numRating) / newCount).toFixed(1));

    await product.save();
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
    const query = (req.query.q || "").trim().toLowerCase();
    const cleanDigits = query.replace(/[^0-9]/g, '');
    if (!query || (cleanDigits.length < 6 && query.length < 4)) {
      return res.json({ success: true, orders: [], tickets: [] });
    }

    const [allOrders, allTickets] = await Promise.all([
      Order.find().sort({ createdAt: -1 }).lean(),
      SupportTicket.find().sort({ createdAt: -1 }).lean()
    ]);

    const matchedOrders = allOrders.filter(o =>
      (cleanDigits.length >= 6 && o.phone && o.phone.includes(cleanDigits)) ||
      (o.id && o.id.toLowerCase() === query)
    );

    const matchedTickets = allTickets.filter(t =>
      (cleanDigits.length >= 6 && t.phone && t.phone.includes(cleanDigits)) ||
      (t.orderId && t.orderId.toLowerCase() === query)
    );

    res.json({ success: true, orders: matchedOrders, tickets: matchedTickets });
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

// Admin Product CRUD (includes costPrice & quick update)
app.post('/api/admin/products', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const { name, mainCategory, category, price, originalPrice, costPrice, stockQuantity, showOnHome, sizeOptions, colorOptions, badge, images, description } = req.body;

    const uploadedUrls = await Promise.all(
      (images || []).map(img => uploadToCloudinary(img, 'aura_store/products'))
    );

    const newProd = await Product.create({
      id: Date.now(),
      name,
      mainCategory,
      category,
      price: Number(price) || 0,
      originalPrice: Number(originalPrice) || Number(price) || 0,
      costPrice: Number(costPrice) || 0,
      stockQuantity: Number(stockQuantity) || 1,
      showOnHome: showOnHome !== false,
      sizeOptions: sizeOptions || [],
      colorOptions: colorOptions || [],
      badge: badge || "New",
      rating: 5.0,
      reviewsCount: 1,
      inStock: Number(stockQuantity) > 0,
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
    const { name, mainCategory, category, price, originalPrice, costPrice, stockQuantity, showOnHome, sizeOptions, colorOptions, badge, images, description } = req.body;

    const uploadedUrls = await Promise.all(
      (images || []).map(img => uploadToCloudinary(img, 'aura_store/products'))
    );

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
        stockQuantity: Number(stockQuantity),
        showOnHome: showOnHome !== false,
        sizeOptions,
        colorOptions,
        badge,
        description,
        images: uploadedUrls,
        inStock: Number(stockQuantity) > 0
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: "Product not found" });
    res.json({ success: true, product: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Quick Inline Price, Cost & Stock Update Endpoint
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
    const { code, discountPercent, minSpend, title, description, showOnStore } = req.body;

    const cleanCode = (code || "").trim().toUpperCase();
    await Coupon.findOneAndUpdate(
      { code: cleanCode },
      {
        code: cleanCode,
        discountPercent: Number(discountPercent) || 10,
        minSpend: Number(minSpend) || 0,
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

app.post('/api/admin/store-settings', async (req, res) => {
  try {
    if (!(await verifyAdminAuth(req))) return res.status(403).json({ success: false, message: "Unauthorized" });
    const { deliveryCharge, codAdvancePercent, dealEndTime, metaPixelId } = req.body;

    const updateFields = {};
    if (deliveryCharge !== undefined) updateFields.deliveryCharge = Number(deliveryCharge) || 0;
    if (codAdvancePercent !== undefined) updateFields.codAdvancePercent = Number(codAdvancePercent) || 15;
    if (dealEndTime !== undefined) updateFields.dealEndTime = Number(dealEndTime) || 0;
    if (metaPixelId !== undefined) updateFields.metaPixelId = String(metaPixelId || "").trim();

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
    const newToken = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ success: true, token: newToken, message: "Admin PIN encrypted & updated successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// SERVER-SIDE PRICE, STOCK & COUPON VALIDATION ON ORDER CREATION
app.post('/api/orders', async (req, res) => {
  try {
    const {
      customerName, phone, pincode, city, state,
      villageOrCity, houseNoStreet, postOffice, policeStation, landmark,
      items, giftNote, couponCode,
      paymentMethod, utrNumber
    } = req.body;

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

    // Fetch authoritative prices & costs from MongoDB
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

    // Verify coupon server-side
    let verifiedDiscount = 0;
    let verifiedCouponCode = "None";
    if (couponCode && String(couponCode).trim()) {
      const cleanCode = String(couponCode).trim().toUpperCase();
      const dbCoupon = await Coupon.findOne({ code: cleanCode }).lean();
      if (dbCoupon && verifiedSubTotal >= (dbCoupon.minSpend || 0)) {
        verifiedDiscount = Math.round((verifiedSubTotal * dbCoupon.discountPercent) / 100);
        verifiedCouponCode = dbCoupon.code;
      }
    }

    // Verify delivery & COD rules server-side
    const storeSettings = await Settings.findOne({ key: 'main' }).lean();
    const deliveryFeeSetting = storeSettings ? (storeSettings.deliveryCharge || 0) : 0;
    const codAdvancePctSetting = storeSettings ? (storeSettings.codAdvancePercent || 15) : 15;

    const normalizedMode = paymentMethod === 'COD' ? 'COD' : 'UPI';
    const appliedDelivery = normalizedMode === 'COD' ? deliveryFeeSetting : 0;
    const verifiedFinalTotal = Math.max(1, verifiedSubTotal - verifiedDiscount + appliedDelivery);

    const verifiedAdvancePaid = normalizedMode === 'COD'
      ? Math.max(1, Math.round((verifiedFinalTotal * codAdvancePctSetting) / 100))
      : verifiedFinalTotal;
    const verifiedBalanceDue = verifiedFinalTotal - verifiedAdvancePaid;
    const estimatedNetProfit = (verifiedSubTotal - verifiedDiscount) - verifiedTotalCost;

    // Deduct stock safely
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
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');

    const order = await Order.create({
      id: orderId,
      customerName,
      phone: cleanPhone,
      address: structuredAddress,
      pincode,
      city,
      state,
      items: verifiedItems,
      giftNote: (giftNote || "").trim(),
      subTotal: verifiedSubTotal,
      discountApplied: verifiedDiscount,
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

    res.json({ success: true, orderId: order.id, verifiedTotal: verifiedFinalTotal });
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

// 4x6 Thermal Shipping Label PDF Route (Admin Authenticated)
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
    res.json({ success: true, orders: matched });
  } catch (err) {
    res.status(500).json({ success: false, orders: [] });
  }
});

// Admin Login with bcrypt + JWT issuance
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

    const [orders, coupons, settings, products, abandonedCarts] = await Promise.all([
      Order.find().sort({ createdAt: -1 }).lean(),
      Coupon.find().lean(),
      Settings.findOne({ key: 'main' }),
      Product.find().sort({ _id: -1 }).lean(),
      AbandonedCart.find().sort({ updatedAt: -1 }).lean()
    ]);

    let activeSettings = settings
      ? {
          deliveryCharge: settings.deliveryCharge,
          codAdvancePercent: settings.codAdvancePercent,
          dealEndTime: settings.dealEndTime,
          metaPixelId: settings.metaPixelId || ""
        }
      : { deliveryCharge: 0, codAdvancePercent: 15, dealEndTime: 0, metaPixelId: "" };

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
      coupons,
      abandonedCarts,
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

// Direct Multer Binary Upload for Delivery Slip (Zero Base64 bloat)
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

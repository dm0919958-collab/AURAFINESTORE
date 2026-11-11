require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');

// ক্লাউডিনারি ও ফাইল আপলোড প্যাকেজ
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 5000;

// অ্যাডমিন প্যানেল পাসওয়ার্ড (পিন)
const ADMIN_SECRET_PIN = "admin123";
const ADMIN_EMAIL = "mahatosarita436@gmail.com";
const ADMIN_PHONE = "916289145092";

// টেলিগ্রাম বট কনফিগারেশন
const TELEGRAM_BOT_TOKEN = "8818940415:AAHdq6roV4XDCF3sxtJdDSqw-Abq20i1KbQ";
const TELEGRAM_CHAT_ID = "8836538477";

// ক্লাউডিনারি কনফিগারেশন (অটো-রিসাইজ ও ৮০ KB কম্প্রেশন)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'txvafr7h',
  api_key: process.env.CLOUDINARY_API_KEY || '757197326572662',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'shG26-qHpVEzSUpokfs3-xDnkyk'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'aura_fine_store_products',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [
      { width: 800, crop: 'limit' },
      { quality: 'auto:eco', fetch_format: 'auto' }
    ]
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // ১০ MB পর্যন্ত ফাইল সাপোর্ট করবে
});

// সরাসরি নন-SRV ক্লাস্টার সংযোগ (DNS এরর মুক্ত)
const DIRECT_MONGO_URI = "mongodb://dm0919958_db_user:Debasish55@ac-flooa9m-shard-00-00.dwaflpi.mongodb.net:27017,ac-flooa9m-shard-00-01.dwaflpi.mongodb.net:27017,ac-flooa9m-shard-00-02.dwaflpi.mongodb.net:27017/aura_store?ssl=true&replicaSet=atlas-cxvzuq-shard-0&authSource=admin&retryWrites=true&w=majority";
const MONGO_URI = process.env.MONGO_URI || DIRECT_MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('🍃 MongoDB Atlas Connected Successfully!'))
  .catch(err => {
    console.error('⚠️ Direct Atlas fail, retrying fallback...', err.message);
    mongoose.connect(DIRECT_MONGO_URI)
      .then(() => console.log('🍃 MongoDB Atlas Connected via Fallback!'))
      .catch(e => console.error('❌ Final Connection Error:', e.message));
  });

// MongoDB Order Schema
const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  customerName: String,
  phone: String,
  address: String,
  pincode: String,
  city: String,
  state: String,
  items: Array,
  subTotal: Number,
  discountApplied: Number,
  deliveryCharge: Number,
  couponCode: String,
  total: Number,
  paymentMethod: String,
  advancePaid: Number,
  balanceDue: Number,
  utrNumber: String,
  status: { type: String, default: "Pending Verification" },
  courierPartner: { type: String, default: "Delhivery" },
  awbNumber: { type: String, default: "" },
  deliverySlipFile: { type: String, default: "" },
  date: String,
  orderDateRaw: String
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

// জিমেইল ট্রান্সপোর্টার
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: ADMIN_EMAIL,
    pass: process.env.EMAIL_APP_PASSWORD || 'your-gmail-app-password'
  }
});

let storeData = {
  dealBanners: [
    {
      id: 1,
      productId: 7,
      title: "Magnetic Couple Heart Bracelets Set",
      tag: "GF & BF SPECIAL • FLAT 50% OFF",
      image: "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=1200&auto=format&fit=crop&q=80"
    },
    {
      id: 2,
      productId: 3,
      title: "Men's Luxury Oxford Cotton Shirt",
      tag: "MEN'S SPECIAL • 50% SAVINGS",
      image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=1200&auto=format&fit=crop&q=80"
    },
    {
      id: 3,
      productId: 5,
      title: "Anarkali Embroidered Flared Kurti",
      tag: "WOMEN ETHNIC • FLAT 50% OFF",
      image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1200&auto=format&fit=crop&q=80"
    },
    {
      id: 4,
      productId: 8,
      title: "100 Languages 'I Love You' Projection Pendant",
      tag: "ROMANTIC LOVE PICK • SAVE 60%",
      image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=1200&auto=format&fit=crop&q=80"
    },
    {
      id: 5,
      productId: 1,
      title: "Royal Heritage Kundan Drop Jhumkas",
      tag: "FESTIVE BESTSELLER • FLAT 46% OFF",
      image: "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=1200&auto=format&fit=crop&q=80"
    },
    {
      id: 6,
      productId: 9,
      title: "Preserved Everlasting Rose Gift Hamper",
      tag: "ANNIVERSARY LUXURY • SPECIAL DEAL",
      image: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=1200&auto=format&fit=crop&q=80"
    }
  ],
  coupons: [
    {
      code: "DIWALI33",
      discountPercent: 33,
      minSpend: 499,
      title: "শুভ দীপাবলি স্পেশাল অফার",
      description: "কমপক্ষে ৪৯৯ টাকার কেনাকাটায় সরাসরি ৩৩% ছাড়!",
      showOnStore: true
    },
    {
      code: "AURA20",
      discountPercent: 20,
      minSpend: 0,
      title: "মেগা ওয়েলকাম অফার",
      description: "যেকোনো মূল্যের কেনাকাটায় সরাসরি ২০% ফ্ল্যাট ছাড় উপভোগ করুন।",
      showOnStore: true
    }
  ],
  storeSettings: {
    deliveryCharge: 0,
    codAdvancePercent: 15
  },
  products: [
    {
      id: 1,
      name: "Royal Heritage Kundan Drop Jhumkas",
      mainCategory: "Women",
      category: "Jhumka",
      price: 699,
      originalPrice: 1299,
      stockQuantity: 12,
      badge: "Bestseller",
      rating: 4.9,
      reviewsCount: 142,
      inStock: true,
      sizeInfo: "Height: 6.5 cm | Weight: 26g",
      sizeOptions: ["Standard Free Size"],
      colorOptions: ["Gold Polish", "Antique Silver", "Rose Gold"],
      images: [
        "https://images.unsplash.com/photo-1630019852942-f89202989a59?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1611591477439-0cf06efb5c3b?w=600&auto=format&fit=crop&q=80"
      ],
      description: "22K micron gold plated traditional handcrafted earrings with river pearls."
    },
    {
      id: 2,
      name: "Solitaire Floral Diamond Studs",
      mainCategory: "Women",
      category: "Studs",
      price: 449,
      originalPrice: 899,
      stockQuantity: 8,
      badge: "Trending",
      rating: 4.8,
      reviewsCount: 89,
      inStock: true,
      sizeInfo: "Height: 1.8 cm | Weight: 6g",
      sizeOptions: ["Standard"],
      colorOptions: ["Silver Platinum", "Rose Gold"],
      images: [
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Austrian AAA cubic zirconia stones set in hypo-allergenic alloy."
    },
    {
      id: 5,
      name: "Anarkali Embroidered Flared Kurti",
      mainCategory: "Women",
      category: "Kurtis",
      price: 999,
      originalPrice: 1999,
      stockQuantity: 14,
      badge: "Festive",
      rating: 4.9,
      reviewsCount: 65,
      inStock: true,
      sizeInfo: "Sizes: S, M, L, XL, XXL",
      sizeOptions: ["S (36)", "M (38)", "L (40)", "XL (42)", "XXL (44)"],
      colorOptions: ["Crimson Red", "Royal Navy Blue", "Teal Green"],
      images: [
        "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Rayon cotton heavy gold zari embroidery work ethnic flared kurti."
    },
    {
      id: 10,
      name: "Banarasi Silk Woven Wedding Saree",
      mainCategory: "Women",
      category: "Sarees",
      price: 1899,
      originalPrice: 3999,
      stockQuantity: 9,
      badge: "Bridal Silk",
      rating: 5.0,
      reviewsCount: 48,
      inStock: true,
      sizeInfo: "Length: 5.5m Saree + 0.8m Blouse Piece",
      sizeOptions: ["Standard 6.3 Meters"],
      colorOptions: ["Bridal Red", "Deep Maroon", "Royal Magenta"],
      images: [
        "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Pure rich zari woven floral border royal crimson red Banarasi silk saree."
    },
    {
      id: 11,
      name: "Velvet Quilted Luxury Shoulder Handbag",
      mainCategory: "Women",
      category: "Handbags",
      price: 799,
      originalPrice: 1599,
      stockQuantity: 15,
      badge: "Party Essential",
      rating: 4.8,
      reviewsCount: 52,
      inStock: true,
      sizeInfo: "Dimensions: 24cm x 16cm x 8cm with Golden Chain",
      sizeOptions: ["Standard"],
      colorOptions: ["Emerald Green", "Midnight Black", "Burgundy"],
      images: [
        "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Premium velvet finish quilted crossbody evening party clutch bag."
    },
    {
      id: 3,
      name: "Men's Luxury Oxford Cotton Shirt",
      mainCategory: "Men",
      category: "Shirts",
      price: 899,
      originalPrice: 1799,
      stockQuantity: 15,
      badge: "Men's Special",
      rating: 4.9,
      reviewsCount: 56,
      inStock: true,
      sizeInfo: "Sizes: M (38), L (40), XL (42), XXL (44)",
      sizeOptions: ["M (38)", "L (40)", "XL (42)", "XXL (44)"],
      colorOptions: ["Pure White", "Sky Blue", "Navy Blue"],
      images: [
        "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&auto=format&fit=crop&q=80"
      ],
      description: "100% pure combed breathable Oxford cotton tailored for formal and casual style."
    },
    {
      id: 4,
      name: "Men's Solid Crewneck Premium T-Shirt",
      mainCategory: "Men",
      category: "T-Shirts",
      price: 499,
      originalPrice: 999,
      stockQuantity: 20,
      badge: "Essential",
      rating: 4.7,
      reviewsCount: 78,
      inStock: true,
      sizeInfo: "Regular Fit (S, M, L, XL)",
      sizeOptions: ["S (38)", "M (40)", "L (42)", "XL (44)"],
      colorOptions: ["Jet Black", "Charcoal Grey", "Olive Green"],
      images: [
        "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Heavyweight 220 GSM bio-washed pre-shrunk cotton round neck t-shirt."
    },
    {
      id: 6,
      name: "Men's Chronograph Matte Black Watch",
      mainCategory: "Men",
      category: "Watches",
      price: 1199,
      originalPrice: 2499,
      stockQuantity: 10,
      badge: "Luxury",
      rating: 4.8,
      reviewsCount: 92,
      inStock: true,
      sizeInfo: "Dial: 42mm | Stainless Steel Mesh Strap",
      sizeOptions: ["Free Size (Adjustable Strap)"],
      colorOptions: ["All Matte Black", "Black with Rose Gold Dial"],
      images: [
        "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Water resistant Japanese quartz analog chronograph wrist watch."
    },
    {
      id: 7,
      name: "Mutual Attraction Magnetic Couple Bracelets",
      mainCategory: "Gifts",
      category: "Couples",
      price: 499,
      originalPrice: 1199,
      stockQuantity: 25,
      badge: "BF & GF Pick",
      rating: 5.0,
      reviewsCount: 215,
      inStock: true,
      sizeInfo: "Free Size Adjustable Braided Rope with Magnetic Heart Bell",
      sizeOptions: ["Adjustable Free Size"],
      colorOptions: ["Black & White Pair", "Full Matte Black Pair"],
      images: [
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Magnetic couple bracelets that connect together when holding hands. Perfect for lovers & anniversaries."
    },
    {
      id: 8,
      name: "100 Languages 'I Love You' Projection Pendant",
      mainCategory: "Gifts",
      category: "Romantic",
      price: 599,
      originalPrice: 1499,
      stockQuantity: 18,
      badge: "Romantic Gift",
      rating: 4.9,
      reviewsCount: 167,
      inStock: true,
      sizeInfo: "Chain Length: 45 cm | Nano-Carved Crystal",
      sizeOptions: ["Standard 45cm Chain"],
      colorOptions: ["Rose Gold", "Platinum Silver"],
      images: [
        "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Shine your phone camera or flashlight through the center stone to reveal 'I Love You' in 100 languages."
    },
    {
      id: 9,
      name: "Preserved Rose & Velvet Jewelry Gift Box",
      mainCategory: "Gifts",
      category: "Gift Sets",
      price: 899,
      originalPrice: 1899,
      stockQuantity: 12,
      badge: "Anniversary Special",
      rating: 5.0,
      reviewsCount: 104,
      inStock: true,
      sizeInfo: "Luxury Box with Sliding Secret Gift Drawer",
      sizeOptions: ["Luxury Gift Box Package"],
      colorOptions: ["Royal Crimson Red", "Romantic Baby Pink"],
      images: [
        "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Everlasting natural preserved red rose arrangement in an acrylic case with a jewelry drawer."
    },
    {
      id: 12,
      name: "His & Hers Matching Crown Couple Rings",
      mainCategory: "Gifts",
      category: "Couples",
      price: 449,
      originalPrice: 999,
      stockQuantity: 20,
      badge: "Love Symbol",
      rating: 4.8,
      reviewsCount: 88,
      inStock: true,
      sizeInfo: "Adjustable Free Size (Fits all fingers)",
      sizeOptions: ["Adjustable Free Size"],
      colorOptions: ["Silver Plated King & Queen Pair"],
      images: [
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600&auto=format&fit=crop&q=80"
      ],
      description: "Sterling silver plated King & Queen crown couple promise rings with velvet box."
    }
  ]
};

// প্রফেশনাল ট্যাক্স ইনভয়েস PDF জেনারেটর
function createOrderPdfBuffer(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 35, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const primaryColor = '#451a03';
      const accentGold = '#b45309';
      const darkText = '#1c1917';
      const mutedText = '#57534e';
      const lightBg = '#fcfbf9';
      const borderColor = '#e7e5e4';

      doc.rect(35, 35, 525, 6).fill(accentGold);
      doc.fontSize(24).font('Helvetica-Bold').fillColor(primaryColor).text('AURA FINE STORE', 35, 50, { letterSpacing: 2 });
      doc.fontSize(9).font('Helvetica').fillColor(mutedText).text('Premium Lifestyle, Ethnic Wear & Luxury Collections', 35, 76);
      doc.fontSize(8).fillColor(mutedText).text('Bolpur, Birbhum, West Bengal - 731204 | Support: +91 6289145092', 35, 88);

      doc.roundedRect(385, 48, 175, 48, 4).fillAndStroke(lightBg, borderColor);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(accentGold).text('TAX INVOICE / BILL', 395, 56);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(darkText).text(`Order ID: #${order.id}`, 395, 70);
      doc.fontSize(8).font('Helvetica').fillColor(mutedText).text(`Date: ${order.date}`, 395, 82);

      doc.strokeColor(borderColor).lineWidth(1).moveTo(35, 110).lineTo(560, 110).stroke();

      const cardY = 120;
      const cardHeight = 90;

      doc.roundedRect(35, cardY, 255, cardHeight, 6).fillAndStroke(lightBg, borderColor);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(accentGold).text('BILLED & DELIVERED TO:', 45, cardY + 8);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(darkText).text(order.customerName, 45, cardY + 20);
      doc.fontSize(8).font('Helvetica').fillColor(darkText).text(`Phone: +91 ${order.phone}`, 45, cardY + 33);
      doc.fontSize(8).font('Helvetica').fillColor(mutedText).text(order.address, 45, cardY + 45, { width: 235, lineGap: 1 });

      doc.roundedRect(305, cardY, 255, cardHeight, 6).fillAndStroke(lightBg, borderColor);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(accentGold).text('DISPATCH LOGISTICS:', 315, cardY + 8);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(darkText).text('AURA Central Logistics Hub', 315, cardY + 20);
      doc.fontSize(8).font('Helvetica').fillColor(mutedText).text('Bolpur, Birbhum, WB - 731204', 315, cardY + 33);
      doc.fontSize(8).font('Helvetica').fillColor(darkText).text(`Courier Partner: ${order.courierPartner || 'Delhivery Express'}`, 315, cardY + 45);
      doc.fontSize(8).font('Helvetica').fillColor(mutedText).text(`AWB / Tracking: ${order.awbNumber || 'Post-Packing Dispatch'}`, 315, cardY + 57);

      const tableTop = 225;
      doc.roundedRect(35, tableTop, 525, 22, 4).fill(primaryColor);
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
      doc.text('SL', 45, tableTop + 7);
      doc.text('ITEM DESCRIPTION', 75, tableTop + 7);
      doc.text('UNIT PRICE', 360, tableTop + 7, { width: 55, align: 'right' });
      doc.text('QTY', 430, tableTop + 7, { width: 35, align: 'center' });
      doc.text('TOTAL', 480, tableTop + 7, { width: 70, align: 'right' });

      let curY = tableTop + 24;
      (order.items || []).forEach((item, index) => {
        const rowHeight = 28;
        if (index % 2 === 0) doc.rect(35, curY, 525, rowHeight).fill('#fafaf9');

        doc.fontSize(8).font('Helvetica').fillColor(mutedText).text(`${index + 1}`, 45, curY + 6);
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor(darkText).text(item.name, 75, curY + 4, { width: 280, ellipsis: true });
        doc.fontSize(7.5).font('Helvetica').fillColor(accentGold).text(`Size: ${item.selectedSize || 'Standard'} | Color: ${item.selectedColor || 'Standard'}`, 75, curY + 15);

        doc.fontSize(8.5).font('Helvetica').fillColor(darkText).text(`Rs. ${item.price}`, 360, curY + 8, { width: 55, align: 'right' });
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor(darkText).text(`${item.qty}`, 430, curY + 8, { width: 35, align: 'center' });
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor).text(`Rs. ${item.price * item.qty}`, 480, curY + 8, { width: 70, align: 'right' });

        doc.strokeColor(borderColor).lineWidth(0.5).moveTo(35, curY + rowHeight).lineTo(560, curY + rowHeight).stroke();
        curY += rowHeight;
      });

      const summaryTop = Math.max(curY + 15, 365);

      doc.roundedRect(35, summaryTop, 270, 115, 6).fillAndStroke(lightBg, borderColor);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(accentGold).text('PAYMENT VERIFICATION:', 45, summaryTop + 10);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(darkText).text(`Mode: ${order.paymentMethod}`, 45, summaryTop + 24);
      
      if (order.paymentMethod === 'COD') {
        doc.fontSize(8).font('Helvetica').fillColor(mutedText).text(`Advance Paid (UPI): Rs. ${order.advancePaid}`, 45, summaryTop + 38);
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#b91c1c').text(`Cash Due at Doorstep: Rs. ${order.balanceDue}`, 45, summaryTop + 50);
      } else {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#047857').text('Payment: 100% Fully Paid (Verified)', 45, summaryTop + 38);
      }
      doc.fontSize(8).font('Helvetica').fillColor(mutedText).text(`Transaction UTR: ${order.utrNumber}`, 45, summaryTop + 65);
      doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#059669').text('* 100% Safe & Authenticated Order', 45, summaryTop + 95);

      const calcX = 320;
      doc.roundedRect(calcX, summaryTop, 240, 115, 6).fillAndStroke('#ffffff', borderColor);

      doc.fontSize(8.5).font('Helvetica').fillColor(mutedText).text('Bag Subtotal:', calcX + 12, summaryTop + 12);
      doc.font('Helvetica-Bold').fillColor(darkText).text(`Rs. ${order.subTotal}`, calcX + 140, summaryTop + 12, { width: 85, align: 'right' });

      doc.fontSize(8.5).font('Helvetica').fillColor(mutedText).text(`Coupon Discount:`, calcX + 12, summaryTop + 27);
      doc.font('Helvetica-Bold').fillColor('#059669').text(`- Rs. ${order.discountApplied}`, calcX + 140, summaryTop + 27, { width: 85, align: 'right' });

      doc.fontSize(8.5).font('Helvetica').fillColor(mutedText).text('Delivery Charge:', calcX + 12, summaryTop + 42);
      doc.font('Helvetica-Bold').fillColor(order.deliveryCharge > 0 ? darkText : '#059669').text(order.deliveryCharge > 0 ? `Rs. ${order.deliveryCharge}` : 'FREE', calcX + 140, summaryTop + 42, { width: 85, align: 'right' });

      doc.fontSize(8.5).font('Helvetica').fillColor(mutedText).text('GST & Taxes Included:', calcX + 12, summaryTop + 57);
      doc.font('Helvetica-Bold').fillColor(darkText).text('Rs. 0.00', calcX + 140, summaryTop + 57, { width: 85, align: 'right' });

      doc.rect(calcX, summaryTop + 78, 240, 37).fill(primaryColor);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff').text('TOTAL BILL AMOUNT:', calcX + 12, summaryTop + 90);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#fbbf24').text(`Rs. ${order.total}`, calcX + 130, summaryTop + 89, { width: 95, align: 'right' });

      const footerY = 505;
      doc.strokeColor(borderColor).lineWidth(1).moveTo(35, footerY).lineTo(560, footerY).stroke();

      doc.fontSize(8).font('Helvetica-Bold').fillColor(darkText).text('TERMS & REPLACEMENT POLICY:', 35, footerY + 10);
      doc.fontSize(7).font('Helvetica').fillColor(mutedText).text('1. 7-Day Replacement: Report transit damage via WhatsApp (+91 6289145092) within 7 days.', 35, footerY + 22);
      doc.fontSize(7).font('Helvetica').fillColor(mutedText).text('2. Please keep unboxing video for transit guarantee coverage.', 35, footerY + 32);

      doc.roundedRect(420, footerY + 10, 140, 48, 4).fillAndStroke(lightBg, borderColor);
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(primaryColor).text('AURA FINE STORE', 430, footerY + 16, { align: 'center', width: 120 });
      doc.fontSize(6.5).font('Helvetica').fillColor(mutedText).text('Digitally Verified Bill', 430, footerY + 28, { align: 'center', width: 120 });
      doc.fontSize(6.5).font('Helvetica-Bold').fillColor(accentGold).text('[ Authorized Signature ]', 430, footerY + 42, { align: 'center', width: 120 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// টেলিগ্রামে সরাসরি আসল PDF ফাইল পাঠানো
async function sendTelegramPdfDocument(pdfBuffer, order) {
  try {
    const filename = `Invoice_${order.id}.pdf`;
    const caption = `🧾 <b>AURA FINE STORE - NEW ORDER CONFIRMED</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>Order ID:</b> <code>#${order.id}</code>\n` +
      `👤 <b>Customer:</b> ${order.customerName}\n` +
      `📞 <b>Mobile:</b> <code>${order.phone}</code>\n` +
      `📍 <b>Address:</b> ${order.address}\n` +
      `💰 <b>Total Bill:</b> <b>₹${order.total}</b> (${order.paymentMethod})\n` +
      `🚚 <b>Delivery Fee:</b> ₹${order.deliveryCharge}\n` +
      `🔑 <b>UTR:</b> <code>${order.utrNumber}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>অর্ডারের সম্পূর্ণ অফিশিয়াল PDF চালান নিচে সংযুক্ত করা হলো।</i>`;

    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('document', pdfBlob, filename);

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;
    await fetch(url, { method: 'POST', body: formData });
  } catch (err) {
    console.error("Telegram error:", err.message);
  }
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// স্টোর ডাটা ফেচ
app.get('/api/store', (req, res) => {
  res.json({
    dealBanners: storeData.dealBanners,
    products: storeData.products,
    coupons: storeData.coupons,
    storeSettings: storeData.storeSettings
  });
});

// [নতুন প্রোডাক্ট যোগ করার রাউট - সিঙ্গেল বা মাল্টিপল ছবি সাপোর্ট]
const handleProductUpload = (req, res) => {
  const { pin, title, name, mainCategory, mainSection, category, subCategory, price, cutPrice, originalPrice, stockQuantity, stockQty, badge, trustBadge, description, sizes, colors } = req.body;
  if (pin && pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  let uploadedImages = [];
  if (req.files && req.files.length > 0) {
    uploadedImages = req.files.map(f => f.path);
  } else if (req.file) {
    uploadedImages.push(req.file.path);
  } else if (req.body.image) {
    uploadedImages.push(req.body.image);
  }

  if (uploadedImages.length === 0) {
    uploadedImages.push("https://images.unsplash.com/photo-1630019852942-f89202989a59?w=600");
  }

  const newId = storeData.products.length > 0 ? Math.max(...storeData.products.map(p => p.id || 0)) + 1 : 1;

  const newProduct = {
    id: newId,
    name: title || name || "New Luxury Item",
    mainCategory: mainSection || mainCategory || "Women",
    category: subCategory || category || "Earrings",
    price: Number(price) || 499,
    originalPrice: Number(cutPrice) || Number(originalPrice) || ((Number(price) || 499) * 2),
    stockQuantity: Number(stockQty) !== undefined ? Number(stockQty) : (Number(stockQuantity) || 10),
    badge: trustBadge || badge || "New Arrival",
    rating: 5.0,
    reviewsCount: 1,
    inStock: true,
    sizeInfo: "Standard Size",
    sizeOptions: sizes ? (typeof sizes === 'string' ? sizes.split(',').map(s => s.trim()) : sizes) : ["Standard"],
    colorOptions: colors ? (typeof colors === 'string' ? colors.split(',').map(c => c.trim()) : colors) : ["Original Color"],
    images: uploadedImages,
    description: description || "Handcrafted premium quality collection from AURA Fine Store."
  };

  storeData.products.unshift(newProduct);
  res.json({ success: true, message: "Product added successfully!", products: storeData.products });
};

app.post('/api/admin/products', upload.any(), handleProductUpload);

// [প্রোডাক্ট এডিট ও ছবি আপডেট করার রাউট - Edit Catalog Product & Photos]
const handleProductEdit = (req, res) => {
  const { pin, title, name, mainCategory, mainSection, category, subCategory, price, cutPrice, originalPrice, stockQuantity, stockQty, badge, trustBadge, description, sizes, colors } = req.body;
  if (pin && pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  const pId = Number(req.params.id);
  const pIndex = storeData.products.findIndex(p => p.id === pId);

  if (pIndex === -1) {
    return res.status(404).json({ success: false, message: "Product not found!" });
  }

  // Cloudinary দিয়ে আপলোড হওয়া নতুন ছবি
  let newImages = [];
  if (req.files && req.files.length > 0) {
    newImages = req.files.map(f => f.path);
  } else if (req.file) {
    newImages.push(req.file.path);
  }

  // আগের রাখা ছবিগুলো
  let existingImages = storeData.products[pIndex].images || [];
  if (req.body.existingImages) {
    try {
      existingImages = typeof req.body.existingImages === 'string' ? JSON.parse(req.body.existingImages) : req.body.existingImages;
    } catch(e) {}
  }

  const finalImages = [...existingImages, ...newImages];

  storeData.products[pIndex] = {
    ...storeData.products[pIndex],
    name: title || name || storeData.products[pIndex].name,
    mainCategory: mainSection || mainCategory || storeData.products[pIndex].mainCategory,
    category: subCategory || category || storeData.products[pIndex].category,
    price: Number(price) !== undefined && !isNaN(Number(price)) ? Number(price) : storeData.products[pIndex].price,
    originalPrice: Number(cutPrice) || Number(originalPrice) || storeData.products[pIndex].originalPrice,
    stockQuantity: Number(stockQty) !== undefined ? Number(stockQty) : (Number(stockQuantity) !== undefined ? Number(stockQuantity) : storeData.products[pIndex].stockQuantity),
    badge: trustBadge || badge || storeData.products[pIndex].badge,
    description: description !== undefined ? description : storeData.products[pIndex].description,
    images: finalImages.length > 0 ? finalImages : storeData.products[pIndex].images,
    sizeOptions: sizes ? (typeof sizes === 'string' ? sizes.split(',').map(s => s.trim()) : sizes) : storeData.products[pIndex].sizeOptions,
    colorOptions: colors ? (typeof colors === 'string' ? colors.split(',').map(c => c.trim()) : colors) : storeData.products[pIndex].colorOptions
  };

  res.json({
    success: true,
    message: "Product updated successfully!",
    products: storeData.products
  });
};

// POST এবং PUT উভয় মেথড সাপোর্ট দেওয়া হলো যাতে কোনোভাবেই মেথড এরর না আসে
app.post('/api/admin/products/:id', upload.any(), handleProductEdit);
app.put('/api/admin/products/:id', upload.any(), handleProductEdit);

// অ্যাডমিন থেকে প্রোডাক্ট ডিলিট API
app.delete('/api/admin/products/:id', (req, res) => {
  const { pin } = req.body;
  if (pin && pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  const pId = Number(req.params.id);
  storeData.products = storeData.products.filter(p => p.id !== pId);
  res.json({ success: true, message: "Product deleted successfully!", products: storeData.products });
});

// কুপন যোগ/ম্যানেজ
app.post('/api/admin/coupons', (req, res) => {
  const { pin, code, discountPercent, minSpend, title, description, showOnStore } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  const cleanCode = (code || "").trim().toUpperCase();
  const pct = Math.max(1, Math.min(100, Number(discountPercent) || 10));
  const minAmt = Math.max(0, Number(minSpend) || 0);

  if (!cleanCode) return res.status(400).json({ success: false, message: "Coupon code required!" });

  const existingIdx = storeData.coupons.findIndex(c => c.code === cleanCode);
  const couponObj = {
    code: cleanCode,
    discountPercent: pct,
    minSpend: minAmt,
    title: title || `${cleanCode} Special Offer`,
    description: description || `Flat ${pct}% OFF on minimum buy of Rs. ${minAmt}`,
    showOnStore: showOnStore === true || showOnStore === "true"
  };

  if (existingIdx > -1) storeData.coupons[existingIdx] = couponObj;
  else storeData.coupons.push(couponObj);

  res.json({ success: true, coupons: storeData.coupons });
});

app.delete('/api/admin/coupons/:code', (req, res) => {
  const { pin } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });
  storeData.coupons = storeData.coupons.filter(c => c.code !== req.params.code.toUpperCase());
  res.json({ success: true, coupons: storeData.coupons });
});

// ডেলিভারি চার্জ ও COD অ্যাডভান্স সেটিং
app.post('/api/admin/store-settings', (req, res) => {
  const { pin, deliveryCharge, codAdvancePercent } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  if (deliveryCharge !== undefined) storeData.storeSettings.deliveryCharge = Math.max(0, Number(deliveryCharge) || 0);
  if (codAdvancePercent !== undefined) storeData.storeSettings.codAdvancePercent = Math.max(1, Math.min(100, Number(codAdvancePercent) || 15));

  res.json({ success: true, storeSettings: storeData.storeSettings });
});

// কাস্টমার ট্র্যাকিং API
app.get('/api/orders/track', async (req, res) => {
  try {
    const query = (req.query.q || "").trim();
    if (!query) return res.status(400).json({ success: false, message: "Query required" });

    const cleanDigits = query.replace(/[^0-9]/g, '');
    const matched = await Order.find({
      $or: [
        { id: query },
        { phone: { $regex: cleanDigits, $options: 'i' } }
      ]
    }).sort({ createdAt: -1 });

    res.json({ success: true, orders: matched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// কাস্টমার অর্ডার সাবমিট
app.post('/api/orders', async (req, res) => {
  try {
    const { 
      customerName, phone, pincode, city, state, 
      villageOrCity, houseNoStreet, postOffice, policeStation, landmark,
      items, total, subTotal, discountApplied, couponCode, deliveryCharge,
      paymentMethod, utrNumber, advancePaid, balanceDue
    } = req.body;

    const pinRegex = /^[1-9][0-9]{5}$/;
    if (!pinRegex.test(pincode || "")) {
      return res.status(400).json({ success: false, message: "ভুল ভারতীয় পিনকোড প্রদান করা হয়েছে!" });
    }

    const structuredAddress = `${houseNoStreet}, ${villageOrCity}, P.O: ${postOffice}${policeStation ? ', P.S: ' + policeStation : ''}${landmark ? ' (Landmark: ' + landmark + ')' : ''}, ${city}, ${state} - ${pincode}`;

    if (items && items.length > 0) {
      items.forEach(cartItem => {
        const p = storeData.products.find(prod => prod.id === cartItem.id);
        if (p) {
          p.stockQuantity = Math.max(0, (p.stockQuantity || 10) - (cartItem.qty || 1));
          if (p.stockQuantity === 0) p.inStock = false;
        }
      });
    }

    const orderId = 'AUR-' + Math.floor(100000 + Math.random() * 900000);
    const orderDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    const order = {
      id: orderId,
      customerName,
      phone: String(phone).replace(/[^0-9]/g, ''),
      address: structuredAddress,
      pincode,
      city,
      state,
      items: items || [],
      subTotal: Number(subTotal) || Number(total),
      discountApplied: Number(discountApplied) || 0,
      deliveryCharge: Number(deliveryCharge) || 0,
      couponCode: couponCode || "None",
      total: Number(total),
      paymentMethod,
      advancePaid: Number(advancePaid) || 0,
      balanceDue: Number(balanceDue) || 0,
      utrNumber: utrNumber || "N/A",
      status: "Pending Verification",
      courierPartner: "Delhivery",
      awbNumber: "",
      deliverySlipFile: "",
      date: orderDate,
      orderDateRaw: todayStr
    };

    const newOrder = new Order(order);
    await newOrder.save();

    const pdfBuffer = await createOrderPdfBuffer(order);
    sendTelegramPdfDocument(pdfBuffer, order);

    res.json({ success: true, orderId: order.id });

  } catch (err) {
    console.error("Order error:", err);
    res.status(500).json({ success: false, message: "Order creation failed" });
  }
});

// অ্যাডমিন অথেন্টিকেশন
app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  if (pin === ADMIN_SECRET_PIN) return res.json({ success: true, token: "admin-active" });
  res.status(401).json({ success: false, message: "Invalid Passcode!" });
});

// অ্যাডমিন ডেটা ও লাইভ সেলস অ্যানালিটিক্স
app.post('/api/admin/orders', async (req, res) => {
  const { pin } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  try {
    const allDbOrders = await Order.find().sort({ createdAt: -1 });
    const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    const todayOrders = allDbOrders.filter(o => o.orderDateRaw === todayStr || (o.date && o.date.includes(todayStr)));
    const todayOrdersCount = todayOrders.length;
    
    const totalSales = allDbOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalOnlineRevenue = allDbOrders
      .filter(o => o.paymentMethod === 'UPI')
      .reduce((sum, o) => sum + (o.total || 0), 0);
    
    const totalCodRevenue = allDbOrders
      .filter(o => o.paymentMethod === 'COD')
      .reduce((sum, o) => sum + (o.total || 0), 0);

    const pendingCount = allDbOrders.filter(o => o.status && o.status.includes('Pending')).length;

    res.json({
      success: true,
      orders: allDbOrders,
      coupons: storeData.coupons,
      storeSettings: storeData.storeSettings,
      analytics: {
        totalOrders: allDbOrders.length,
        todayOrdersCount,
        totalSales,
        totalOnlineRevenue,
        totalCodRevenue,
        pendingOrders: pendingCount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// অর্ডার স্ট্যাটাস আপডেট
app.post('/api/admin/orders/:id/status', async (req, res) => {
  const { pin, status } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  try {
    const updated = await Order.findOneAndUpdate(
      { id: req.params.id },
      { status: status },
      { new: true }
    );
    if (updated) return res.json({ success: true, status: updated.status });
    res.status(404).json({ success: false, message: "Order not found" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ডেলিভারি ট্র্যাকিং ও AWB আপডেট
app.post('/api/admin/orders/:id/dispatch-tracking', async (req, res) => {
  const { pin, courierPartner, awbNumber } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  try {
    const updated = await Order.findOneAndUpdate(
      { id: req.params.id },
      { 
        courierPartner, 
        awbNumber, 
        status: "Verified & Shipped" 
      },
      { new: true }
    );

    if (updated) {
      const msg = encodeURIComponent(`Namaste ${updated.customerName}! Your AURA Fine Store order #${updated.id} is shipped via ${courierPartner}. Tracking AWB: ${awbNumber}`);
      const waUrl = `https://api.whatsapp.com/send?phone=91${updated.phone}&text=${msg}`;
      return res.json({ success: true, sendTrackingWhatsAppUrl: waUrl });
    }
    res.status(404).json({ success: false, message: "Order not found" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// অফিসিয়াল ডেলিভারি স্লিপ আপলোড
app.post('/api/admin/orders/:id/upload-slip', async (req, res) => {
  const { pin, slipFileBase64 } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  try {
    const updated = await Order.findOneAndUpdate(
      { id: req.params.id },
      { deliverySlipFile: slipFileBase64 },
      { new: true }
    );
    if (updated) return res.json({ success: true });
    res.status(404).json({ success: false, message: "Order not found" });
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

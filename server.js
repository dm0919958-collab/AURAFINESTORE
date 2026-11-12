const express = require('express');
const cors = require('cors');
const path = require('path');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 5000;

const ADMIN_SECRET_PIN = "admin123";

const TELEGRAM_BOT_TOKEN = "8818940415:AAHdq6roV4XDCF3sxtJdDSqw-Abq20i1KbQ";
const TELEGRAM_CHAT_ID = "8836538477";

const SUPPORT_BOT_TOKEN = "9025873079:AAFiDAk_5FOGpNGRvjBtuVhwFHyfnn6pX1I";
const SUPPORT_CHAT_ID = "8836538477";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'txvafr7h',
  api_key: process.env.CLOUDINARY_API_KEY || '757197326572662',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'shG26-qHpVEzSUpokfs3-xDnkyk'
});

async function uploadToCloudinary(fileData, folder = 'aura_store') {
  if (!fileData) return "";
  if (fileData.startsWith('http://') || fileData.startsWith('https://')) {
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
    return fileData;
  }
}

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://din786584_db_user:UxrbgZntEhDU0vfx@cluster0.vstmeuy.mongodb.net/aura_store?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected Successfully to aura_store');
    seedInitialData();
  })
  .catch(err => console.error('❌ MongoDB Connection Error:', err.message));

const productSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: String,
  mainCategory: String,
  category: String,
  price: Number,
  originalPrice: Number,
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
  codAdvancePercent: { type: Number, default: 15 }
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
  subTotal: Number,
  discountApplied: Number,
  deliveryCharge: Number,
  couponCode: String,
  total: Number,
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
    id: 310,
    name: "Tailored Stretch Chino Formal Trousers",
    mainCategory: "Men",
    category: "Trousers",
    price: 1099,
    originalPrice: 2199,
    stockQuantity: 16,
    badge: "Executive Fit",
    rating: 4.8,
    reviewsCount: 61,
    inStock: true,
    showOnHome: false,
    sizeOptions: ["30", "32", "34", "36"],
    colorOptions: ["Charcoal Grey", "Classic Navy", "Warm Khaki"],
    images: [
      "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=480&q=55"
    ],
    description: "Wrinkle-resistant cotton-lycra tailored formal trousers designed for all-day office and evening comfort.",
    reviews: []
  },
  {
    id: 311,
    name: "AURA Noir Oud Royal Eau De Parfum (100ml)",
    mainCategory: "Men",
    category: "Perfumes",
    price: 1299,
    originalPrice: 2499,
    stockQuantity: 20,
    badge: "Long Lasting",
    rating: 4.9,
    reviewsCount: 112,
    inStock: true,
    showOnHome: false,
    sizeOptions: ["100 ml Bottle"],
    colorOptions: ["Royal Noir Oud"],
    images: [
      "https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=480&q=55"
    ],
    description: "Deep woody Arabian oud blended with amber, bergamot, and warm spices offering 12+ hours of sillage.",
    reviews: []
  },
  {
    id: 401,
    name: "Royal Heritage Kundan Drop Jhumkas",
    mainCategory: "Women",
    category: "Jhumka",
    price: 699,
    originalPrice: 1299,
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
    id: 404,
    name: "Solitaire Zirconia Halo Floral Studs",
    mainCategory: "Women",
    category: "Studs",
    price: 399,
    originalPrice: 799,
    stockQuantity: 25,
    badge: "Sparkle Cut",
    rating: 4.9,
    reviewsCount: 110,
    inStock: true,
    showOnHome: false,
    sizeOptions: ["Free Size (1.2 cm)"],
    colorOptions: ["Platinum Silver", "Rose Gold Polish"],
    images: [
      "https://images.unsplash.com/photo-1635767798638-3e25273a8236?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=480&q=55"
    ],
    description: "5A diamond-cut cubic zirconia surrounded by sparkling micro-pave crystals with push-back closures.",
    reviews: []
  },
  {
    id: 407,
    name: "Anarkali Embroidered Pure Chanderi Kurti",
    mainCategory: "Women",
    category: "Kurtis",
    price: 1199,
    originalPrice: 2399,
    stockQuantity: 15,
    badge: "Royal Festive",
    rating: 4.9,
    reviewsCount: 96,
    inStock: true,
    showOnHome: false,
    sizeOptions: ["M (38)", "L (40)", "XL (42)", "XXL (44)"],
    colorOptions: ["Mustard Gold", "Pastel Mint Green", "Royal Maroon"],
    images: [
      "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=480&q=55"
    ],
    description: "Graceful flared Chanderi silk blend Anarkali kurti adorned with intricate sequin zari work and cotton lining.",
    reviews: []
  },
  {
    id: 410,
    name: "Banarasi Katan Silk Woven Zari Saree",
    mainCategory: "Women",
    category: "Sarees",
    price: 1899,
    originalPrice: 3899,
    stockQuantity: 12,
    badge: "Bridal Classic",
    rating: 5.0,
    reviewsCount: 128,
    inStock: true,
    showOnHome: true,
    sizeOptions: ["Standard 6.3m (With Blouse Piece)"],
    colorOptions: ["Vermillion Red", "Peacock Teal Blue", "Emerald Green"],
    images: [
      "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=480&q=55"
    ],
    description: "Woven with gleaming golden Kadwa floral jaal along with heavy designer pallu and matching unstitched blouse.",
    reviews: []
  },
  {
    id: 413,
    name: "Velvet Quilted Evening Crossbody Sling Bag",
    mainCategory: "Women",
    category: "Handbags",
    price: 799,
    originalPrice: 1599,
    stockQuantity: 19,
    badge: "Trending Bag",
    rating: 4.9,
    reviewsCount: 84,
    inStock: true,
    showOnHome: false,
    sizeOptions: ["Compact (22x15 cm)"],
    colorOptions: ["Midnight Black Velvet", "Wine Maroon Velvet"],
    images: [
      "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&w=480&q=55"
    ],
    description: "Plush diamond quilted velvet sling crafted with antique gold hardware curb chain and high-security twist lock.",
    reviews: []
  },
  {
    id: 416,
    name: "22K Gold Plated Temple Kundan Bangles Set",
    mainCategory: "Women",
    category: "Bangles",
    price: 849,
    originalPrice: 1699,
    stockQuantity: 16,
    badge: "Bridal Set",
    rating: 4.9,
    reviewsCount: 73,
    inStock: true,
    showOnHome: false,
    sizeOptions: ["2.4", "2.6", "2.8"],
    colorOptions: ["Antique Temple Gold", "Ruby Emerald Gold"],
    images: [
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=480&q=55"
    ],
    description: "Intricately carved royal temple motif kadas encrusted with uncut Kundan stones and screw-lock clasp.",
    reviews: []
  },
  {
    id: 501,
    name: "Magnetic Mutual Heart Couple Bracelets Set",
    mainCategory: "Gifts",
    category: "Couples",
    price: 499,
    originalPrice: 999,
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
  },
  {
    id: 504,
    name: "100 Languages I Love You Projection Necklace",
    mainCategory: "Gifts",
    category: "Romantic",
    price: 499,
    originalPrice: 999,
    stockQuantity: 22,
    badge: "Viral Trend",
    rating: 4.9,
    reviewsCount: 140,
    inStock: true,
    showOnHome: false,
    sizeOptions: ["45cm Chain"],
    colorOptions: ["Rose Gold Finish", "Platinum Silver"],
    images: [
      "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55"
    ],
    description: "Using phone light or holding close reveals 'I Love You' etched in 100 languages inside the central micro crystal.",
    reviews: []
  },
  {
    id: 507,
    name: "Luxury Couple Grand Surprise Hamper Box",
    mainCategory: "Gifts",
    category: "Gift Sets",
    price: 1299,
    originalPrice: 2599,
    stockQuantity: 10,
    badge: "Mega Hamper",
    rating: 5.0,
    reviewsCount: 112,
    inStock: true,
    showOnHome: false,
    sizeOptions: ["Grand Combo Box"],
    colorOptions: ["Signature Black & Gold", "Romantic Blush"],
    images: [
      "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55"
    ],
    description: "Includes Magnetic Bracelets, Projection Pendant, Velvet Rose Case, Scented Candle, and Love Message Scroll.",
    reviews: []
  },
  {
    id: 510,
    name: "Crystal LED 3D Galaxy Rose Heart Lamp",
    mainCategory: "Gifts",
    category: "Customized Lamps",
    price: 749,
    originalPrice: 1499,
    stockQuantity: 18,
    badge: "Night Glow",
    rating: 4.9,
    reviewsCount: 95,
    inStock: true,
    showOnHome: false,
    sizeOptions: ["Wooden LED Base (10cm)"],
    colorOptions: ["Warm Golden Glow", "Multicolor Ambient"],
    images: [
      "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=480&q=55",
      "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=480&q=55"
    ],
    description: "Laser-engraved K9 optical crystal sphere on natural beechwood LED base that illuminates any room with romantic warmth.",
    reviews: []
  }
];

async function seedInitialData() {
  try {
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
      await Product.insertMany(defaultProducts);
    }
    const bannerCount = await Banner.countDocuments();
    if (bannerCount === 0) {
      await Banner.insertMany(defaultBanners);
    }
    const couponCount = await Coupon.countDocuments();
    if (couponCount === 0) {
      await Coupon.insertMany(defaultCoupons);
    }
    const existingSettings = await Settings.findOne({ key: 'main' });
    if (!existingSettings) {
      await Settings.create({ key: 'main', deliveryCharge: 0, codAdvancePercent: 15 });
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
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

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
        doc.fillColor('#111827').fontSize(8.5).font('Helvetica');
        doc.text(String(idx + 1), 52, currentY + 3);

        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9);
        doc.text(item.name, 85, currentY);

        doc.fillColor('#92400e').font('Helvetica').fontSize(7.5);
        doc.text(`Size: ${item.selectedSize || 'Standard'} | Color: ${item.selectedColor || 'Standard'}`, 85, currentY + 12);

        doc.fillColor('#111827').font('Helvetica').fontSize(8.5);
        doc.text(`Rs. ${item.price}`, 335, currentY + 4, { width: 70, align: 'right' });
        doc.text(String(item.qty || 1), 420, currentY + 4, { width: 35, align: 'center' });
        doc.font('Helvetica-Bold').text(`Rs. ${(item.price || 0) * (item.qty || 1)}`, 470, currentY + 4, { width: 75, align: 'right' });

        currentY += 30;
        doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor('#f3f4f6').lineWidth(0.5).stroke();
        currentY += 4;
      });

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

async function sendTelegramAlert(order) {
  try {
    const text = `🧾 <b>AURA FINE STORE - NEW ORDER CONFIRMED</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>Order ID:</b> <code>#${order.id}</code>\n` +
      `👤 <b>Customer:</b> ${order.customerName}\n` +
      `📞 <b>Mobile:</b> <code>${order.phone}</code>\n` +
      `📍 <b>Address:</b> ${order.address}\n` +
      `💰 <b>Total Bill:</b> <b>₹${order.total}</b> (${order.paymentMethod})\n` +
      `🚚 <b>Delivery Fee:</b> ₹${order.deliveryCharge}\n` +
      `🔑 <b>UTR:</b> <code>${order.utrNumber}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Official PDF Invoice is attached below.</i>`;

    const pdfBuffer = await generateOrderInvoicePDF(order);

    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('caption', text);
    formData.append('parse_mode', 'HTML');
    
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('document', blob, `Invoice_${order.id}.pdf`);

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: formData
    });
  } catch (err) {
    console.error("Telegram alert error:", err.message);
  }
}

function dataURLtoBuffer(dataUrl) {
  const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;
  return {
    mimeType: matches[1],
    buffer: Buffer.from(matches[2], 'base64')
  };
}

app.use(cors());
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/store', async (req, res) => {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });

    const [dealBanners, products, coupons, settings] = await Promise.all([
      Banner.find().lean(),
      Product.find().sort({ _id: -1 }).lean(),
      Coupon.find().lean(),
      Settings.findOne({ key: 'main' }).lean()
    ]);

    res.json({
      dealBanners,
      products,
      coupons,
      storeSettings: settings || { deliveryCharge: 0, codAdvancePercent: 15 }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Database error" });
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

app.post('/api/support/ticket', async (req, res) => {
  try {
    const { orderId, issueText, photosBase64, videoBase64 } = req.body;
    const order = await Order.findOne({ id: orderId }).lean();
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const ticketId = 'TKT-' + Math.floor(100000 + Math.random() * 900000);
    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    await SupportTicket.create({
      ticketId,
      orderId: order.id,
      customerName: order.customerName,
      phone: order.phone,
      issueText: issueText.trim(),
      adminReply: "",
      repliedAt: "",
      createdAtStr: nowStr
    });

    const itemsListText = (order.items || [])
      .map((item, idx) => `${idx + 1}. ${item.name} (Size: ${item.selectedSize || 'N/A'}, Color: ${item.selectedColor || 'N/A'}) x${item.qty || 1} - ₹${(item.price || 0) * (item.qty || 1)}`)
      .join('\n');

    const supportMessage =
      `🚨 <b>NEW SUPPORT COMPLAINT (${ticketId})</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>Order ID:</b> <code>#${order.id}</code>\n` +
      `📅 <b>Order Date:</b> ${order.date}\n` +
      `📌 <b>Current Status:</b> ${order.status}\n` +
      `👤 <b>Customer Name:</b> ${order.customerName}\n` +
      `📞 <b>Mobile:</b> <code>+91 ${order.phone}</code>\n` +
      `📍 <b>Address:</b> ${order.address}\n` +
      `💰 <b>Total Paid:</b> ₹${order.total} (${order.paymentMethod})\n` +
      `🔑 <b>UTR:</b> <code>${order.utrNumber || 'N/A'}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛍️ <b>ORDERED ITEMS:</b>\n${itemsListText}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ <b>CUSTOMER PROBLEM:</b>\n` +
      `<i>"${issueText}"</i>`;

    await fetch(`https://api.telegram.org/bot${SUPPORT_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: SUPPORT_CHAT_ID,
        text: supportMessage,
        parse_mode: 'HTML'
      })
    });

    if (Array.isArray(photosBase64) && photosBase64.length > 0) {
      for (let i = 0; i < photosBase64.length; i++) {
        const parsedPhoto = dataURLtoBuffer(photosBase64[i]);
        if (parsedPhoto) {
          const photoForm = new FormData();
          photoForm.append('chat_id', SUPPORT_CHAT_ID);
          photoForm.append('caption', `📸 Issue Photo ${i + 1} | Order #${order.id} (${order.customerName} - ${order.phone})`);
          const photoBlob = new Blob([parsedPhoto.buffer], { type: parsedPhoto.mimeType });
          photoForm.append('photo', photoBlob, `Support_${order.id}_${i + 1}.jpg`);

          await fetch(`https://api.telegram.org/bot${SUPPORT_BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            body: photoForm
          });
        }
      }
    }

    if (videoBase64) {
      const parsedVideo = dataURLtoBuffer(videoBase64);
      if (parsedVideo) {
        const videoForm = new FormData();
        videoForm.append('chat_id', SUPPORT_CHAT_ID);
        videoForm.append('caption', `🎥 Issue Video Proof | Order #${order.id} (${order.customerName} - ${order.phone})`);
        const videoBlob = new Blob([parsedVideo.buffer], { type: parsedVideo.mimeType || 'video/mp4' });
        videoForm.append('document', videoBlob, `Support_Video_${order.id}.mp4`);

        await fetch(`https://api.telegram.org/bot${SUPPORT_BOT_TOKEN}/sendDocument`, {
          method: 'POST',
          body: videoForm
        });
      }
    }

    res.json({ success: true, ticketId });
  } catch (err) {
    console.error("Support ticket error:", err.message);
    res.status(500).json({ success: false, message: "Failed to submit support issue." });
  }
});

app.post('/api/admin/support/tickets', async (req, res) => {
  try {
    const { pin } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });
    const tickets = await SupportTicket.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, tickets });
  } catch (err) {
    res.status(500).json({ success: false, tickets: [] });
  }
});

app.post('/api/admin/support/reply', async (req, res) => {
  try {
    const { pin, ticketId, replyText } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

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
    const { pin } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });
    await SupportTicket.deleteOne({ ticketId: req.params.ticketId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/products', async (req, res) => {
  try {
    const { pin, name, mainCategory, category, price, originalPrice, stockQuantity, showOnHome, sizeOptions, colorOptions, badge, images, description } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

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
    const { pin, name, mainCategory, category, price, originalPrice, stockQuantity, showOnHome, sizeOptions, colorOptions, badge, images, description } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

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

app.patch('/api/admin/products/:id/toggle-home', async (req, res) => {
  try {
    const { pin, showOnHome } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });
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
    const { pin } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });
    const prodId = Number(req.params.id);
    await Promise.all([
      Product.deleteOne({ id: prodId }),
      Banner.deleteMany({ productId: prodId })
    ]);
    const products = await Product.find().lean();
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/banners/add', async (req, res) => {
  try {
    const { pin, title, tag, productId, image } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

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
    const { pin } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });
    await Banner.deleteOne({ id: Number(req.params.id) });
    const dealBanners = await Banner.find().lean();
    res.json({ success: true, dealBanners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/coupons', async (req, res) => {
  try {
    const { pin, code, discountPercent, minSpend, title, description, showOnStore } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

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
    const { pin } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });
    await Coupon.deleteOne({ code: req.params.code.toUpperCase() });
    const coupons = await Coupon.find().lean();
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/store-settings', async (req, res) => {
  try {
    const { pin, deliveryCharge, codAdvancePercent } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

    const updateFields = {};
    if (deliveryCharge !== undefined) updateFields.deliveryCharge = Number(deliveryCharge) || 0;
    if (codAdvancePercent !== undefined) updateFields.codAdvancePercent = Number(codAdvancePercent) || 15;

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

app.post('/api/orders', async (req, res) => {
  try {
    const { 
      customerName, phone, pincode, city, state, 
      villageOrCity, houseNoStreet, postOffice, policeStation, landmark,
      items, total, subTotal, discountApplied, couponCode, deliveryCharge,
      paymentMethod, utrNumber, advancePaid, balanceDue
    } = req.body;

    const structuredAddress = `${houseNoStreet}, ${villageOrCity}, P.O: ${postOffice}${policeStation ? ', P.S: ' + policeStation : ''}${landmark ? ' (Landmark: ' + landmark + ')' : ''}, ${city}, ${state} - ${pincode}`;

    if (items && items.length > 0) {
      for (const cartItem of items) {
        const p = await Product.findOne({ id: cartItem.id });
        if (p) {
          p.stockQuantity = Math.max(0, (p.stockQuantity || 10) - (cartItem.qty || 1));
          p.inStock = p.stockQuantity > 0;
          await p.save();
        }
      }
    }

    const orderId = 'AUR-' + Math.floor(100000 + Math.random() * 900000);
    const orderDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

    const appliedDelivery = paymentMethod === 'COD' ? (Number(deliveryCharge) || 0) : 0;

    const order = await Order.create({
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
      deliveryCharge: appliedDelivery,
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
    });

    await sendTelegramAlert(order);

    res.json({ success: true, orderId: order.id });
  } catch (err) {
    res.status(500).json({ success: false, message: "Order creation failed" });
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

app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  if (pin === ADMIN_SECRET_PIN) return res.json({ success: true, token: "admin-active" });
  res.status(401).json({ success: false, message: "Invalid Passcode!" });
});

app.post('/api/admin/orders', async (req, res) => {
  try {
    const { pin } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

    const [orders, coupons, settings] = await Promise.all([
      Order.find().sort({ createdAt: -1 }).lean(),
      Coupon.find().lean(),
      Settings.findOne({ key: 'main' }).lean()
    ]);

    const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const todayOrders = orders.filter(o => o.orderDateRaw === todayStr || (o.date && o.date.includes(todayStr)));
    const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalOnlineRevenue = orders.filter(o => o.paymentMethod === 'UPI').reduce((sum, o) => sum + (o.total || 0), 0);
    const totalCodRevenue = orders.filter(o => o.paymentMethod === 'COD').reduce((sum, o) => sum + (o.total || 0), 0);

    res.json({
      success: true,
      orders,
      coupons,
      storeSettings: settings || { deliveryCharge: 0, codAdvancePercent: 15 },
      analytics: {
        totalOrders: orders.length,
        todayOrdersCount: todayOrders.length,
        totalSales,
        totalOnlineRevenue,
        totalCodRevenue,
        pendingOrders: orders.filter(o => o.status && o.status.includes('Pending')).length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/orders/:id', async (req, res) => {
  try {
    const { pin } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

    const orderId = req.params.id;
    const deleted = await Order.deleteOne({ id: orderId });
    if (deleted.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, message: `Order #${orderId} deleted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/admin/orders/:id/status', async (req, res) => {
  try {
    const { pin, status } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });
    const order = await Order.findOneAndUpdate({ id: req.params.id }, { status }, { new: true });
    if (order) return res.json({ success: true, status: order.status });
    res.status(404).json({ success: false });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/admin/orders/:id/dispatch-tracking', async (req, res) => {
  try {
    const { pin, courierPartner, awbNumber } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

    const order = await Order.findOneAndUpdate(
      { id: req.params.id },
      { courierPartner, awbNumber, status: "Verified & Shipped" },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/admin/orders/:id/upload-slip', async (req, res) => {
  try {
    const { pin, slipFileBase64 } = req.body;
    if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

    const slipUrl = await uploadToCloudinary(slipFileBase64, 'aura_store/delivery_slips');

    const order = await Order.findOneAndUpdate(
      { id: req.params.id },
      { deliverySlipFile: slipUrl },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`🛍️ Store: http://localhost:${PORT}`);
  console.log(`🔒 Admin: http://localhost:${PORT}/admin`);
});

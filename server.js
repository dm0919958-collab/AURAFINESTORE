const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 5000;

// অ্যাডমিন প্যানেল ক্রেডেনশিয়াল
const ADMIN_SECRET_PIN = "admin123";
const ADMIN_EMAIL = "mahatosarita436@gmail.com";

// টেলিগ্রাম কনফিগারেশন
const TELEGRAM_BOT_TOKEN = "8818940415:AAHdq6roV4XDCF3sxtJdDSqw-Abq20i1KbQ";
const TELEGRAM_CHAT_ID = "8836538477";

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
  ],
  coupons: [
    {
      code: "DIWALI33",
      discountPercent: 33,
      minSpend: 499,
      title: "শুভ দীপাবলি স্পেশাল অফার",
      description: "কমপক্ষে ৪৯৯ টাকার কেনাকাটায় সরাসরি ৩৩% ছাড়!",
      showOnStore: true
    },
    {
      code: "AURA20",
      discountPercent: 20,
      minSpend: 0,
      title: "মেগা ওয়েলকাম অফার",
      description: "যেকোনো মূল্যের কেনাকাটায় সরাসরি ২০% ফ্ল্যাট ছাড় উপভোগ করুন।",
      showOnStore: true
    }
  ],
  storeSettings: {
    deliveryCharge: 0,
    codAdvancePercent: 15
  },
  products: [
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
      sizeOptions: ["M (38)", "L (40)", "XL (42)", "XXL (44)"],
      colorOptions: ["Pure White", "Sky Blue", "Pastel Pink", "Navy Blue"],
      images: [
        "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1620012253295-c15c429f66bf?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=480&q=55"
      ],
      description: "100% breathable pure combed Oxford cotton with formal spread collar and double-stitched durability."
    },
    {
      id: 302,
      name: "Royal Linen Blend Casual Resort Shirt",
      mainCategory: "Men",
      category: "Shirts",
      price: 949,
      originalPrice: 1899,
      stockQuantity: 14,
      badge: "Trending",
      rating: 4.8,
      reviewsCount: 42,
      inStock: true,
      sizeOptions: ["M (38)", "L (40)", "XL (42)"],
      colorOptions: ["Olive Green", "Beige Sand", "Charcoal", "Sky Mist"],
      images: [
        "https://images.unsplash.com/photo-1589310243389-96a5483213a8?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1620012253295-c15c429f66bf?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Lightweight European linen blend casual shirt crafted for effortless summer and evening sophistication."
    },
    {
      id: 303,
      name: "Executive Dark Tartan Checked Shirt",
      mainCategory: "Men",
      category: "Shirts",
      price: 799,
      originalPrice: 1599,
      stockQuantity: 20,
      badge: "Popular",
      rating: 4.7,
      reviewsCount: 39,
      inStock: true,
      sizeOptions: ["S (36)", "M (38)", "L (40)", "XL (42)"],
      colorOptions: ["Dark Maroon", "Forest Green", "Royal Navy", "Slate Grey"],
      images: [
        "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1589310243389-96a5483213a8?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Rich micro-brushed cotton woven with timeless tartan checks and a curved tailored hem."
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
      sizeOptions: ["S", "M", "L", "XL", "XXL"],
      colorOptions: ["Pitch Black", "Pure White", "Sage Olive", "Earthy Sand"],
      images: [
        "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=480&q=55"
      ],
      description: "240 GSM ultra-combed Supima cotton t-shirt with bio-wash finish and structured drop-shoulder fit."
    },
    {
      id: 305,
      name: "Vintage Aesthetic Washed Graphic Tee",
      mainCategory: "Men",
      category: "T-Shirts",
      price: 599,
      originalPrice: 1199,
      stockQuantity: 15,
      badge: "Trending",
      rating: 4.8,
      reviewsCount: 52,
      inStock: true,
      sizeOptions: ["M", "L", "XL"],
      colorOptions: ["Washed Grey", "Faded Rust", "Vintage Indigo", "Off-Black"],
      images: [
        "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Streetwear aesthetic acid-washed crew neck t-shirt with fade-resistant artisanal typography."
    },
    {
      id: 306,
      name: "Signature Pique Knit Polo T-Shirt",
      mainCategory: "Men",
      category: "T-Shirts",
      price: 699,
      originalPrice: 1399,
      stockQuantity: 18,
      badge: "Premium Polo",
      rating: 4.9,
      reviewsCount: 64,
      inStock: true,
      sizeOptions: ["M", "L", "XL", "XXL"],
      colorOptions: ["Navy Blue", "Crimson Red", "Jet Black", "Snow White"],
      images: [
        "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Breathable textured honeycomb pique knit polo shirt finished with ribbed collar and genuine horn buttons."
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
      sizeOptions: ["Standard (42mm Case)"],
      colorOptions: ["Obsidian Black", "Emerald Gold", "Silver Blue", "Rose Gold"],
      images: [
        "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1533139502658-0198f920d8e8?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Multi-dial functional quartz chronograph watch with anti-scratch sapphire crystal and surgical stainless steel casing."
    },
    {
      id: 308,
      name: "Vintage Genuine Leather Gentleman Timepiece",
      mainCategory: "Men",
      category: "Watches",
      price: 1399,
      originalPrice: 2799,
      stockQuantity: 12,
      badge: "Classic",
      rating: 4.8,
      reviewsCount: 46,
      inStock: true,
      sizeOptions: ["Standard (40mm Case)"],
      colorOptions: ["Antique Tan Brown", "Dark Chocolate", "Matte Black", "Cognac"],
      images: [
        "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1533139502658-0198f920d8e8?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Hand-stitched genuine calfskin leather watch paired with an ultra-slim satin metallic dial and Japanese movement."
    },
    {
      id: 309,
      name: "Matte All-Black Minimalist Steel Watch",
      mainCategory: "Men",
      category: "Watches",
      price: 1599,
      originalPrice: 3199,
      stockQuantity: 9,
      badge: "Limited Drop",
      rating: 4.9,
      reviewsCount: 61,
      inStock: true,
      sizeOptions: ["Standard (41mm Case)"],
      colorOptions: ["Stealth Black", "Gunmetal Grey", "Deep Space Navy", "Silver Mesh"],
      images: [
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1533139502658-0198f920d8e8?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Ultra-modern ion-plated stealth black finish featuring magnetic Milanese mesh band and water resistance up to 5 ATM."
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
      sizeOptions: ["Standard (Height: 6.5 cm)"],
      colorOptions: ["22K Antique Gold", "Kundan Pearl White", "Ruby Emerald Dual"],
      images: [
        "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55"
      ],
      description: "22K micron gold plated traditional handcrafted earrings with real freshwater river seed pearls."
    },
    {
      id: 402,
      name: "Peacock Meenakari Tribal Dome Jhumkas",
      mainCategory: "Women",
      category: "Jhumka",
      price: 599,
      originalPrice: 1199,
      stockQuantity: 18,
      badge: "Handcrafted",
      rating: 4.8,
      reviewsCount: 89,
      inStock: true,
      sizeOptions: ["Standard (Height: 5.5 cm)"],
      colorOptions: ["Royal Blue Meena", "Emerald Green Meena", "Crimson Red"],
      images: [
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Artisanal hand-painted Meenakari enamel peacock artwork suspended above micro-tinkle floral ghungroos."
    },
    {
      id: 403,
      name: "Vintage Silver Oxidised Temple Jhumkas",
      mainCategory: "Women",
      category: "Jhumka",
      price: 499,
      originalPrice: 999,
      stockQuantity: 22,
      badge: "Trending",
      rating: 4.7,
      reviewsCount: 67,
      inStock: true,
      sizeOptions: ["Standard (Height: 6.0 cm)"],
      colorOptions: ["Oxidised Silver", "German Silver Dual", "Matte Black Silver"],
      images: [
        "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Bohemian silver oxidised finish inspired by temple motifs with lightweight hypoallergenic ear hooks."
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
      sizeOptions: ["Free Size (1.2 cm)"],
      colorOptions: ["Platinum Silver", "Rose Gold Polish", "Champagne Gold"],
      images: [
        "https://images.unsplash.com/photo-1635767798638-3e25273a8236?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=480&q=55"
      ],
      description: "5A diamond-cut cubic zirconia surrounded by sparkling micro-pave crystals with push-back closures."
    },
    {
      id: 405,
      name: "925 Sterling Silver Plated Pearl Studs",
      mainCategory: "Women",
      category: "Studs",
      price: 449,
      originalPrice: 899,
      stockQuantity: 20,
      badge: "Daily Grace",
      rating: 4.8,
      reviewsCount: 74,
      inStock: true,
      sizeOptions: ["8mm Pearl", "10mm Pearl"],
      colorOptions: ["Pure Ivory White", "Blush Pink Pearl", "Tahitian Grey"],
      images: [
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1635767798638-3e25273a8236?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Classy and skin-friendly cultured shell pearls mounted onto anti-tarnish rhodium plated stems."
    },
    {
      id: 406,
      name: "Geometric Hexagon Ruby Stone Studs",
      mainCategory: "Women",
      category: "Studs",
      price: 499,
      originalPrice: 999,
      stockQuantity: 16,
      badge: "Modern Chic",
      rating: 4.9,
      reviewsCount: 58,
      inStock: true,
      sizeOptions: ["Standard (1.0 cm)"],
      colorOptions: ["Crimson Ruby", "Emerald Green", "Sapphire Blue"],
      images: [
        "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1635767798638-3e25273a8236?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Contemporary bezel-set multi-faceted synthetic stones designed for modern office and party wear."
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
      sizeOptions: ["M (38)", "L (40)", "XL (42)", "XXL (44)"],
      colorOptions: ["Mustard Gold", "Pastel Mint Green", "Dusty Pink", "Royal Maroon"],
      images: [
        "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Graceful flared Chanderi silk blend Anarkali kurti adorned with intricate sequin zari work and cotton lining."
    },
    {
      id: 408,
      name: "Jaipuri Hand-Block Printed Cotton Straight Kurti",
      mainCategory: "Women",
      category: "Kurtis",
      price: 799,
      originalPrice: 1599,
      stockQuantity: 20,
      badge: "Daily Cotton",
      rating: 4.8,
      reviewsCount: 82,
      inStock: true,
      sizeOptions: ["S (36)", "M (38)", "L (40)", "XL (42)"],
      colorOptions: ["Indigo Blue", "Turmeric Ochre", "Madder Red"],
      images: [
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=480&q=55"
      ],
      description: "100% pure lightweight Cambric cotton styled with Mandarin collar and three-quarter tailored sleeves."
    },
    {
      id: 409,
      name: "Lucknowi Chikankari Rayon Long Kurti",
      mainCategory: "Women",
      category: "Kurtis",
      price: 899,
      originalPrice: 1799,
      stockQuantity: 18,
      badge: "Chikankari Art",
      rating: 4.9,
      reviewsCount: 114,
      inStock: true,
      sizeOptions: ["M (38)", "L (40)", "XL (42)", "XXL (44)"],
      colorOptions: ["Lavender Lilac", "Sky Breeze", "Snow White", "Peach Rose"],
      images: [
        "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Authentic hand-embroidered Bakhiya and Phanda thread work crafted gracefully on butter-soft rayon fabric."
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
      sizeOptions: ["Standard 6.3m (With Blouse Piece)"],
      colorOptions: ["Vermillion Red", "Peacock Teal Blue", "Wine Purple", "Emerald Green"],
      images: [
        "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Woven with gleaming golden Kadwa floral jaal along with heavy designer pallu and matching unstitched blouse."
    },
    {
      id: 411,
      name: "Pure Soft Organza Floral Hand-Painted Saree",
      mainCategory: "Women",
      category: "Sarees",
      price: 1399,
      originalPrice: 2799,
      stockQuantity: 16,
      badge: "Celebrity Pick",
      rating: 4.8,
      reviewsCount: 76,
      inStock: true,
      sizeOptions: ["Standard 6.3m (With Blouse Piece)"],
      colorOptions: ["Blush Pink Organza", "Mint Green Organza", "Butter Yellow"],
      images: [
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1635767798638-3e25273a8236?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Feather-light sheer organza saree with delicate floral motifs and scallop embroidery bordered in golden sequins."
    },
    {
      id: 412,
      name: "Traditional Handloom Linen Jamdani Saree",
      mainCategory: "Women",
      category: "Sarees",
      price: 1249,
      originalPrice: 2499,
      stockQuantity: 14,
      badge: "Handloom Heritage",
      rating: 4.9,
      reviewsCount: 91,
      inStock: true,
      sizeOptions: ["Standard 6.3m (With Blouse Piece)"],
      colorOptions: ["Beige & Antique Gold", "Charcoal & Silver", "Indigo & Copper"],
      images: [
        "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=480&q=55"
      ],
      description: "100 count pure organic linen handloom weave featuring breathable drape, Jamdani motifs, and zari border."
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
      sizeOptions: ["Compact (22x15 cm)"],
      colorOptions: ["Midnight Black Velvet", "Wine Maroon Velvet", "Emerald Green Velvet"],
      images: [
        "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Plush diamond quilted velvet sling crafted with antique gold hardware curb chain and high-security twist lock."
    },
    {
      id: 414,
      name: "Executive Structured Vegan Leather Tote Bag",
      mainCategory: "Women",
      category: "Handbags",
      price: 1099,
      originalPrice: 2199,
      stockQuantity: 12,
      badge: "Office Essential",
      rating: 4.8,
      reviewsCount: 78,
      inStock: true,
      sizeOptions: ["Large (Fits 13\" Laptop)"],
      colorOptions: ["Classic Tan", "Matte Charcoal", "Soft Nude Taupe"],
      images: [
        "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Scratch-resistant vegan saffiano grain leather tote with triple spacious compartments and reinforced dual handles."
    },
    {
      id: 415,
      name: "Handcrafted Zari Clutch with Detachable Chain",
      mainCategory: "Women",
      category: "Handbags",
      price: 699,
      originalPrice: 1399,
      stockQuantity: 17,
      badge: "Party Glam",
      rating: 4.7,
      reviewsCount: 63,
      inStock: true,
      sizeOptions: ["Standard (20x12 cm)"],
      colorOptions: ["Antique Gold", "Shimmer Silver", "Rose Pink Zari"],
      images: [
        "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Artisanal party clutch embellished with intricate bullion zari embroidery and crystal magnetic lock."
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
      sizeOptions: ["Adjustable Size (Pair of 2)"],
      colorOptions: ["Matte Onyx & White Howlite", "All Black Cord", "Silver Charm Milanese"],
      images: [
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=480&q=55"
      ],
      description: "When brought close, the two heart halves automatically snap together via custom magnetic attraction bells."
    },
    {
      id: 502,
      name: "Matching Sun & Moon Adjustable Promise Rings",
      mainCategory: "Gifts",
      category: "Couples",
      price: 549,
      originalPrice: 1099,
      stockQuantity: 20,
      badge: "Couple Promise",
      rating: 4.9,
      reviewsCount: 89,
      inStock: true,
      sizeOptions: ["Adjustable Open Bands (For Him & Her)"],
      colorOptions: ["925 Sterling Silver Plated", "Vintage Black & Rose"],
      images: [
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Symbolizes eternal harmony. Delicate open adjustable bands that resize smoothly to fit any ring finger."
    },
    {
      id: 503,
      name: "His Queen & Her King Engraved Couple Watches",
      mainCategory: "Gifts",
      category: "Couples",
      price: 1699,
      originalPrice: 3399,
      stockQuantity: 12,
      badge: "Royal Pair",
      rating: 4.9,
      reviewsCount: 77,
      inStock: true,
      sizeOptions: ["Couple Combo (Men + Women)"],
      colorOptions: ["Duo Tone Gold & Silver", "All Midnight Black", "Rose Gold & Brown Leather"],
      images: [
        "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Luxury matching his and her watch pair presented inside an aesthetic premium velvet couple jewelry gift box."
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
      sizeOptions: ["45cm Chain"],
      colorOptions: ["Rose Gold Finish", "Platinum Silver"],
      images: [
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Using phone light or holding close reveals 'I Love You' etched in 100 languages inside the central micro crystal."
    },
    {
      id: 505,
      name: "Everlasting Preserved Red Rose Jewel Case",
      mainCategory: "Gifts",
      category: "Romantic",
      price: 699,
      originalPrice: 1399,
      stockQuantity: 15,
      badge: "Pure Love",
      rating: 5.0,
      reviewsCount: 95,
      inStock: true,
      sizeOptions: ["Display Box (10x10x10 cm)"],
      colorOptions: ["Passionate Ruby Red", "Royal Blue", "Princess Pink"],
      images: [
        "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Real fresh rose preserved using bio-infusion lasting 3+ years, with a hidden pull-out jewelry compartment."
    },
    {
      id: 506,
      name: "Crystal LED 3D Galaxy Rose Heart Lamp",
      mainCategory: "Gifts",
      category: "Romantic",
      price: 599,
      originalPrice: 1199,
      stockQuantity: 19,
      badge: "Magical Glow",
      rating: 4.8,
      reviewsCount: 81,
      inStock: true,
      sizeOptions: ["Height: 22 cm"],
      colorOptions: ["Rainbow Holographic", "Warm Gold Fairy Lights"],
      images: [
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Iridescent blooming flower encapsulated within an immaculate glass dome encircled by fairy string lights."
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
      sizeOptions: ["Grand Combo Box"],
      colorOptions: ["Signature Black & Gold", "Romantic Blush"],
      images: [
        "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Includes Magnetic Bracelets, Projection Pendant, Velvet Rose Case, Scented Candle, and Love Message Scroll."
    },
    {
      id: 508,
      name: "Gentleman Boyfriend Leather Care Combo Gift Box",
      mainCategory: "Gifts",
      category: "Gift Sets",
      price: 999,
      originalPrice: 1999,
      stockQuantity: 14,
      badge: "For Him",
      rating: 4.8,
      reviewsCount: 66,
      inStock: true,
      sizeOptions: ["Combo Kit (Wallet, Belt & Pen)"],
      colorOptions: ["Rich Tan Leather", "Matte Black Leather"],
      images: [
        "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55"
      ],
      description: "Handcrafted RFID-protected genuine leather wallet, matching reversible pin-buckle belt, and an executive metal pen."
    },
    {
      id: 509,
      name: "Girlfriend Queen Luxury Perfume & Pendant Set",
      mainCategory: "Gifts",
      category: "Gift Sets",
      price: 1099,
      originalPrice: 2199,
      stockQuantity: 13,
      badge: "For Her",
      rating: 4.9,
      reviewsCount: 83,
      inStock: true,
      sizeOptions: ["Combo Gift Box"],
      colorOptions: ["French Rose & Gold", "Vanilla Orchid & Silver"],
      images: [
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=480&q=55",
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=480&q=55"
      ],
      description: "French floral artisanal perfume paired with a shimmering 925 sterling silver plated butterfly drop pendant."
    }
  ],
  orders: []
};

// =========================================================================
// ১. প্রফেশনাল ও প্রিমিয়াম PDF ইনভয়েস স্লিপ জেনারেটর (image_ce2e86 এর অনুরূপ)
// =========================================================================
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

      // ১. টপ ব্রাউন অ্যাকসেন্ট বার
      doc.rect(40, 35, 515, 6).fill('#854d0e');

      // ২. বাম পাশের ব্র্যান্ডিং
      doc.fillColor('#111827').fontSize(24).font('Helvetica-Bold').text('AURA FINE STORE', 40, 52);
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica').text('Premium Lifestyle, Ethnic Wear & Luxury Collections', 40, 78);
      doc.fillColor('#6b7280').fontSize(8).text('Bolpur, Birbhum, West Bengal - 731204 | Support: +91 6289145092', 40, 90);

      // ৩. ডান পাশের ট্যাক্স ইনভয়েস ব্যাজ বক্স
      doc.roundedRect(365, 48, 190, 52, 6).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.fillColor('#b45309').fontSize(10).font('Helvetica-Bold').text('TAX INVOICE / BILL', 375, 56);
      doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold').text(`Order ID: #${order.id}`, 375, 70);
      doc.fillColor('#4b5563').fontSize(8).font('Helvetica').text(`Date: ${order.date}`, 375, 83);

      // ৪. ডিভাইডার লাইন
      doc.moveTo(40, 114).lineTo(555, 114).strokeColor('#e5e7eb').lineWidth(1).stroke();

      // ৫. কাস্টমার ও লজিস্টিকস ২-কলাম কার্ড
      // --- বাম কার্ড: BILLED & DELIVERED TO ---
      doc.roundedRect(40, 126, 250, 96, 6).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#92400e').fontSize(8.5).font('Helvetica-Bold').text('BILLED & DELIVERED TO:', 50, 136);
      doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold').text(order.customerName || 'Valued Customer', 50, 150);
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica').text(`Phone: +91 ${order.phone}`, 50, 164);
      doc.fillColor('#4b5563').fontSize(8).text(order.address, 50, 177, { width: 230, lineGap: 1.5 });

      // --- ডান কার্ড: DISPATCH LOGISTICS ---
      doc.roundedRect(305, 126, 250, 96, 6).strokeColor('#e5e7eb').stroke();
      doc.fillColor('#92400e').fontSize(8.5).font('Helvetica-Bold').text('DISPATCH LOGISTICS:', 315, 136);
      doc.fillColor('#111827').fontSize(9.5).font('Helvetica-Bold').text('AURA Central Logistics Hub', 315, 150);
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica').text('Bolpur, Birbhum, WB - 731204', 315, 164);
      doc.fillColor('#374151').fontSize(8.5).text(`Courier Partner: ${order.courierPartner || 'Delhivery'}`, 315, 177);
      doc.fillColor('#4b5563').fontSize(8).text(`AWB / Tracking: ${order.awbNumber ? order.awbNumber : 'Post-Packing Dispatch'}`, 315, 190);

      // ৬. অর্ডার আইটেমস টেবিল
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

        // আইটেমের নাম
        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9);
        doc.text(item.name, 85, currentY);

        // সাইজ ও কালার ভ্যারিয়েন্ট
        doc.fillColor('#92400e').font('Helvetica').fontSize(7.5);
        doc.text(`Size: ${item.selectedSize || 'Standard'} | Color: ${item.selectedColor || 'Standard'}`, 85, currentY + 12);

        // মূল্য ও পরিমাণ
        doc.fillColor('#111827').font('Helvetica').fontSize(8.5);
        doc.text(`Rs. ${item.price}`, 335, currentY + 4, { width: 70, align: 'right' });
        doc.text(String(item.qty || 1), 420, currentY + 4, { width: 35, align: 'center' });
        doc.font('Helvetica-Bold').text(`Rs. ${(item.price || 0) * (item.qty || 1)}`, 470, currentY + 4, { width: 75, align: 'right' });

        currentY += 30;
        doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor('#f3f4f6').lineWidth(0.5).stroke();
        currentY += 4;
      });

      // ৭. পেমেন্ট ও সামারি সেকশন
      const summaryY = Math.max(currentY + 15, 360);

      // --- বাম কার্ড: PAYMENT VERIFICATION ---
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

      // --- ডান কার্ড: ক্যালকুলেশন ও টোটাল বিল বার ---
      doc.roundedRect(305, summaryY, 250, 108, 6).strokeColor('#e5e7eb').stroke();
      
      doc.fillColor('#374151').fontSize(8.5).font('Helvetica');
      doc.text('Bag Subtotal:', 318, summaryY + 12);
      doc.font('Helvetica-Bold').text(`Rs. ${order.subTotal}`, 440, summaryY + 12, { width: 105, align: 'right' });

      doc.font('Helvetica').text('Coupon Discount:', 318, summaryY + 26);
      doc.fillColor('#059669').font('Helvetica-Bold').text(`- Rs. ${order.discountApplied || 0}`, 440, summaryY + 26, { width: 105, align: 'right' });

      doc.fillColor('#374151').font('Helvetica').text('Delivery Charge:', 318, summaryY + 40);
      doc.fillColor(order.deliveryCharge > 0 ? '#111827' : '#059669').font('Helvetica-Bold').text(
        order.deliveryCharge > 0 ? `Rs. ${order.deliveryCharge}` : 'FREE', 
        440, summaryY + 40, { width: 105, align: 'right' }
      );

      doc.fillColor('#6b7280').font('Helvetica').text('GST & Taxes Included:', 318, summaryY + 54);
      doc.text('Rs. 0.00', 440, summaryY + 54, { width: 105, align: 'right' });

      // ডার্ক টোটাল স্ট্রিপ
      doc.roundedRect(305, summaryY + 71, 250, 37, 4).fill('#2b1105');
      doc.fillColor('#FFFFFF').fontSize(9.5).font('Helvetica-Bold');
      doc.text('TOTAL BILL AMOUNT:', 318, summaryY + 84);
      doc.fontSize(12).font('Helvetica-Bold').text(`Rs. ${order.total}`, 430, summaryY + 82, { width: 115, align: 'right' });

      // ৮. টার্মস পলিসি ও ডিজিটাল সিগনেচার স্ট্যাম্প
      const footerY = summaryY + 125;
      doc.moveTo(40, footerY - 8).lineTo(555, footerY - 8).strokeColor('#e5e7eb').stroke();

      // টার্মস
      doc.fillColor('#111827').fontSize(8).font('Helvetica-Bold').text('TERMS & REPLACEMENT POLICY:', 40, footerY + 5);
      doc.fillColor('#4b5563').fontSize(7.5).font('Helvetica');
      doc.text('1. 7-Day Replacement: Report transit damage via WhatsApp (+91 6289145092) within 7 days.', 40, footerY + 18);
      doc.text('2. Please keep unboxing video for transit guarantee coverage.', 40, footerY + 28);

      // অথরাইজড সিগনেচার বক্স
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

// =========================================================================
// ২. টেলিগ্রাম অ্যালার্ট এবং PDF স্লিপ সরাসরি পাঠানোর ফাংশন
// =========================================================================
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
      `<i>অর্ডারের সম্পূর্ণ অফিশিয়াল PDF চালান নিচে সংযুক্ত করা হলো।</i>`;

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

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// পাবলিক স্টোর API
app.get('/api/store', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  
  res.json({
    dealBanners: storeData.dealBanners,
    products: storeData.products,
    coupons: storeData.coupons,
    storeSettings: storeData.storeSettings
  });
});

// প্রোডাক্ট অ্যাড, এডিট ও ডিলিট API
app.post('/api/admin/products', (req, res) => {
  const { pin, name, mainCategory, category, price, originalPrice, stockQuantity, sizeOptions, colorOptions, badge, images, description } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  const newProd = {
    id: Date.now(),
    name,
    mainCategory,
    category,
    price: Number(price) || 0,
    originalPrice: Number(originalPrice) || Number(price) || 0,
    stockQuantity: Number(stockQuantity) || 1,
    sizeOptions: sizeOptions || [],
    colorOptions: colorOptions || [],
    badge: badge || "New",
    rating: 5.0,
    reviewsCount: 1,
    inStock: Number(stockQuantity) > 0,
    images: images || [],
    description: description || ""
  };
  storeData.products.unshift(newProd);
  res.json({ success: true, product: newProd });
});

app.put('/api/admin/products/:id', (req, res) => {
  const { pin, name, mainCategory, category, price, originalPrice, stockQuantity, sizeOptions, colorOptions, badge, images, description } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  const prodId = Number(req.params.id);
  const p = storeData.products.find(item => item.id === prodId);
  if (!p) return res.status(404).json({ success: false, message: "Product not found" });

  p.name = name;
  p.mainCategory = mainCategory;
  p.category = category;
  p.price = Number(price);
  p.originalPrice = Number(originalPrice);
  p.stockQuantity = Number(stockQuantity);
  p.sizeOptions = sizeOptions;
  p.colorOptions = colorOptions;
  p.badge = badge;
  p.description = description;
  p.images = images;
  p.inStock = p.stockQuantity > 0;

  res.json({ success: true, product: p });
});

app.delete('/api/admin/products/:id', (req, res) => {
  const { pin } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });
  storeData.products = storeData.products.filter(p => p.id !== Number(req.params.id));
  res.json({ success: true, products: storeData.products });
});

// ব্যানার API
app.post('/api/admin/banners/add', (req, res) => {
  const { pin, title, tag, productId, image } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  const banner = {
    id: Date.now(),
    productId: Number(productId),
    title,
    tag,
    image
  };
  storeData.dealBanners.push(banner);
  res.json({ success: true, dealBanners: storeData.dealBanners });
});

app.delete('/api/admin/banners/:id', (req, res) => {
  const { pin } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });
  storeData.dealBanners = storeData.dealBanners.filter(b => b.id !== Number(req.params.id));
  res.json({ success: true, dealBanners: storeData.dealBanners });
});

// কুপন ও স্টোর সেটিংস API
app.post('/api/admin/coupons', (req, res) => {
  const { pin, code, discountPercent, minSpend, title, description, showOnStore } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  const cleanCode = (code || "").trim().toUpperCase();
  const existingIdx = storeData.coupons.findIndex(c => c.code === cleanCode);
  const couponObj = {
    code: cleanCode,
    discountPercent: Number(discountPercent) || 10,
    minSpend: Number(minSpend) || 0,
    title: title || `${cleanCode} Special Offer`,
    description: description || `Flat ${discountPercent}% OFF`,
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

app.post('/api/admin/store-settings', (req, res) => {
  const { pin, deliveryCharge, codAdvancePercent } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  if (deliveryCharge !== undefined) storeData.storeSettings.deliveryCharge = Number(deliveryCharge) || 0;
  if (codAdvancePercent !== undefined) storeData.storeSettings.codAdvancePercent = Number(codAdvancePercent) || 15;

  res.json({ success: true, storeSettings: storeData.storeSettings });
});

// অর্ডার প্রসেসিং ও ট্র্যাকিং API
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

    storeData.orders.unshift(order);
    await sendTelegramAlert(order);

    res.json({ success: true, orderId: order.id });
  } catch (err) {
    console.error("Order error:", err);
    res.status(500).json({ success: false, message: "Order creation failed" });
  }
});

app.get('/api/orders/track', (req, res) => {
  const query = (req.query.q || "").trim().toLowerCase();
  const cleanDigits = query.replace(/[^0-9]/g, '');
  const matched = storeData.orders.filter(o => 
    o.id.toLowerCase() === query || (cleanDigits.length >= 6 && o.phone.includes(cleanDigits))
  );
  res.json({ success: true, orders: matched });
});

// অ্যাডমিন লগইন ও অর্ডার কন্ট্রোল
app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  if (pin === ADMIN_SECRET_PIN) return res.json({ success: true, token: "admin-active" });
  res.status(401).json({ success: false, message: "Invalid Passcode!" });
});

app.post('/api/admin/orders', (req, res) => {
  const { pin } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  const todayOrders = storeData.orders.filter(o => o.orderDateRaw === todayStr || o.date.includes(todayStr));
  const totalSales = storeData.orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOnlineRevenue = storeData.orders.filter(o => o.paymentMethod === 'UPI').reduce((sum, o) => sum + (o.total || 0), 0);
  const totalCodRevenue = storeData.orders.filter(o => o.paymentMethod === 'COD').reduce((sum, o) => sum + (o.total || 0), 0);

  res.json({
    success: true,
    orders: storeData.orders,
    coupons: storeData.coupons,
    storeSettings: storeData.storeSettings,
    analytics: {
      totalOrders: storeData.orders.length,
      todayOrdersCount: todayOrders.length,
      totalSales,
      totalOnlineRevenue,
      totalCodRevenue,
      pendingOrders: storeData.orders.filter(o => o.status.includes('Pending')).length
    }
  });
});

// অ্যাডমিন থেকে অর্ডার ডিলিট API
app.delete('/api/admin/orders/:id', (req, res) => {
  const { pin } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  const orderId = req.params.id;
  const initialLength = storeData.orders.length;
  storeData.orders = storeData.orders.filter(o => o.id !== orderId);

  if (storeData.orders.length === initialLength) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  res.json({ success: true, message: `Order #${orderId} deleted successfully` });
});

app.patch('/api/admin/orders/:id/status', (req, res) => {
  const { pin, status } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });
  const order = storeData.orders.find(o => o.id === req.params.id);
  if (order) {
    order.status = status;
    return res.json({ success: true, status: order.status });
  }
  res.status(404).json({ success: false });
});

app.post('/api/admin/orders/:id/dispatch-tracking', (req, res) => {
  const { pin, courierPartner, awbNumber } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  const order = storeData.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ success: false, message: "Order not found" });

  order.courierPartner = courierPartner;
  order.awbNumber = awbNumber;
  order.status = "Verified & Shipped";

  res.json({ success: true });
});

app.post('/api/admin/orders/:id/upload-slip', (req, res) => {
  const { pin, slipFileBase64 } = req.body;
  if (pin !== ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: "Unauthorized" });

  const order = storeData.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ success: false, message: "Order not found" });

  order.deliverySlipFile = slipFileBase64;
  res.json({ success: true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`🛍️ Store: http://localhost:${PORT}`);
  console.log(`🔒 Admin: http://localhost:${PORT}/admin`);
});

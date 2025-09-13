// routes/index.js
const express = require("express");
const { authMiddleware, adminAuthMiddleware } = require("../middleware/auth");

// Import all route modules
const authRoutes = require("./auth");
const userRoutes = require("./user");
const postRoutes = require("./post");
const gigRoutes = require("./gigs");
const messageRoutes = require("./messages");
const conversationRoutes = require("./conversations");
const notificationRoutes = require("./notifications");
const projectRoutes = require("./projects");
const paymentRoutes = require("./payment");
const freelancerRoutes = require("./freelancer");
const adminRoutes = require("./admin");

const router = express.Router();

// API Health Check
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "UnJob API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API Info
router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to UnJob API",
    version: "1.0.0",
    documentation: "/api/docs",
    endpoints: {
      auth: "/api/auth",
      users: "/api/user",
      posts: "/api/posts",
      gigs: "/api/gigs",
      messages: "/api/messages",
      conversations: "/api/conversations",
      notifications: "/api/notifications",
      projects: "/api/projects",
      payments: "/api/payments",
      freelancer: "/api/freelancer",
      admin: "/api/admin",
    },
  });
});

// Mount route modules
router.use("/auth", authRoutes);
router.use("/user", authMiddleware, userRoutes);
router.use("/posts", authMiddleware, postRoutes);
router.use("/gigs", authMiddleware, gigRoutes);
router.use("/messages", authMiddleware, messageRoutes);
router.use("/conversations", authMiddleware, conversationRoutes);
router.use("/notifications", authMiddleware, notificationRoutes);
router.use("/projects", authMiddleware, projectRoutes);
router.use("/payments", authMiddleware, paymentRoutes);
router.use("/freelancer", authMiddleware, freelancerRoutes);
router.use("/admin", adminRoutes);

// API Statistics (public)
router.get("/stats", async (req, res) => {
  try {
    const User = require("../models/User");
    const Gig = require("../models/Gig");
    const Post = require("../models/Post");

    const stats = await Promise.all([
      User.countDocuments({ role: "freelancer", isActive: true }),
      User.countDocuments({ role: "hiring", isActive: true }),
      Gig.countDocuments({ status: "active", isActive: true }),
      Post.countDocuments({ isActive: true, isDeleted: false }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalFreelancers: stats[0],
        totalCompanies: stats[1],
        activeGigs: stats[2],
        totalPosts: stats[3],
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch statistics",
    });
  }
});

// API Documentation placeholder
router.get("/docs", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API Documentation",
    note: "Integrate with Swagger/OpenAPI for full documentation",
    baseUrl: process.env.BASE_URL || "http://localhost:3001",
    routes: {
      authentication: {
        register: "POST /api/auth/register",
        login: "POST /api/auth/login",
        googleAuth: "POST /api/auth/google",
        forgotPassword: "POST /api/auth/forgot-password",
        resetPassword: "POST /api/auth/reset-password/:token",
        getMe: "GET /api/auth/me",
      },
      users: {
        getProfile: "GET /api/user/profile",
        updateProfile: "PUT /api/user/profile",
        completeProfile: "PATCH /api/user/complete-profile",
        getUserById: "GET /api/user/:userId",
        followUser: "POST /api/user/:userId/follow",
        searchUsers: "GET /api/user/search",
      },
      posts: {
        createPost: "POST /api/posts",
        getAllPosts: "GET /api/posts",
        getPostById: "GET /api/posts/:id",
        updatePost: "PUT /api/posts/:id",
        deletePost: "DELETE /api/posts/:id",
        likePost: "POST /api/posts/:id/like",
        addComment: "POST /api/posts/:id/comments",
      },
      gigs: {
        createGig: "POST /api/gigs",
        getAllGigs: "GET /api/gigs",
        getGigById: "GET /api/gigs/:id",
        applyToGig: "POST /api/gigs/:id/apply",
        getGigApplications: "GET /api/gigs/:id/applications",
        searchGigs: "GET /api/gigs/search",
      },
      messages: {
        sendMessage: "POST /api/messages",
        getMessages: "GET /api/messages/:conversationId",
        markAsRead: "PUT /api/messages/:conversationId/read",
      },
      conversations: {
        getConversations: "GET /api/conversations",
        createConversation: "POST /api/conversations",
        getConversationById: "GET /api/conversations/:id",
      },
      notifications: {
        getNotifications: "GET /api/notifications",
        markAsRead: "PUT /api/notifications/:id/read",
        markAllAsRead: "PUT /api/notifications/read-all",
      },
      projects: {
        submitProject: "POST /api/projects",
        getProjects: "GET /api/projects",
        updateProjectStatus: "PUT /api/projects/:id/status",
      },
      payments: {
        createOrder: "POST /api/payments/create-order",
        verifyPayment: "POST /api/payments/verify",
        getPayments: "GET /api/payments",
        getPaymentById: "GET /api/payments/:id",
        requestRefund: "POST /api/payments/:id/refund",
      },
      freelancer: {
        getDashboard: "GET /api/freelancer/dashboard",
        getBankDetails: "GET /api/freelancer/bank-details",
        updateBankDetails: "POST /api/freelancer/bank-details",
        getWallet: "GET /api/freelancer/wallet",
        withdraw: "POST /api/freelancer/withdraw",
      },
      admin: {
        getDashboard: "GET /api/admin/dashboard",
        getUsers: "GET /api/admin/users",
        updateUserStatus: "PUT /api/admin/users/:userId/status",
        getGigs: "GET /api/admin/gigs",
        approveGig: "PUT /api/admin/gigs/:gigId/approve",
        getPayments: "GET /api/admin/payments",
      },
    },
  });
});

module.exports = router;

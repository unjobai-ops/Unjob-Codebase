// routes/admin.js
const express = require("express");
const { adminAuthMiddleware, requireAdmin } = require("../middleware/auth");
const {
  validatePagination,
  validateObjectId,
} = require("../middleware/validation");

const router = express.Router();

// All routes require admin access
router.use(adminAuthMiddleware);
router.use(requireAdmin);

// Dashboard and analytics
router.get("/dashboard", async (req, res) => {
  try {
    const User = require("../models/User");
    const Gig = require("../models/Gig");
    const Payment = require("../models/Payment");
    const Post = require("../models/Post");

    // Get basic statistics
    const stats = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "freelancer" }),
      User.countDocuments({ role: "hiring" }),
      Gig.countDocuments({ status: "active" }),
      Payment.countDocuments({ status: "completed" }),
      Post.countDocuments({ isActive: true }),
    ]);

    // Get recent activity
    const recentUsers = await User.find()
      .select("name email role createdAt")
      .sort("-createdAt")
      .limit(10);

    const recentPayments = await Payment.find({ status: "completed" })
      .populate("payer", "name email")
      .populate("payee", "name email")
      .sort("-completedAt")
      .limit(10);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers: stats[0],
        totalFreelancers: stats[1],
        totalCompanies: stats[2],
        activeGigs: stats[3],
        completedPayments: stats[4],
        totalPosts: stats[5],
      },
      recentActivity: {
        recentUsers,
        recentPayments,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch dashboard data",
    });
  }
});

// User management
router.get("/users", validatePagination, async (req, res) => {
  try {
    const User = require("../models/User");
    const { page = 1, limit = 20, role, status, search } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (role) query.role = role;
    if (status === "active") query.isActive = true;
    if (status === "inactive") query.isActive = false;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query)
      .select("-password")
      .sort("-createdAt")
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        hasNext: page < Math.ceil(totalUsers / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch users",
    });
  }
});

router.put(
  "/users/:userId/status",
  validateObjectId("userId"),
  async (req, res) => {
    try {
      const User = require("../models/User");
      const { isActive } = req.body;

      const user = await User.findByIdAndUpdate(
        req.params.userId,
        { isActive },
        { new: true }
      ).select("-password");

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      res.status(200).json({
        success: true,
        message: `User ${isActive ? "activated" : "deactivated"} successfully`,
        user,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to update user status",
      });
    }
  }
);

// Gig management
router.get("/gigs", validatePagination, async (req, res) => {
  try {
    const Gig = require("../models/Gig");
    const { page = 1, limit = 20, status, category } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;

    const gigs = await Gig.find(query)
      .populate("company", "name email profile.companyName")
      .sort("-postedAt")
      .skip(skip)
      .limit(parseInt(limit));

    const totalGigs = await Gig.countDocuments(query);

    res.status(200).json({
      success: true,
      gigs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalGigs / limit),
        totalGigs,
        hasNext: page < Math.ceil(totalGigs / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch gigs",
    });
  }
});

router.put(
  "/gigs/:gigId/approve",
  validateObjectId("gigId"),
  async (req, res) => {
    try {
      const Gig = require("../models/Gig");
      const { isApproved } = req.body;

      const gig = await Gig.findByIdAndUpdate(
        req.params.gigId,
        {
          isApproved,
          approvedBy: req.user._id,
          approvedAt: isApproved ? new Date() : null,
        },
        { new: true }
      ).populate("company", "name email");

      if (!gig) {
        return res.status(404).json({
          success: false,
          error: "Gig not found",
        });
      }

      res.status(200).json({
        success: true,
        message: `Gig ${isApproved ? "approved" : "rejected"} successfully`,
        gig,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to update gig approval status",
      });
    }
  }
);

// Payment management
router.get("/payments", validatePagination, async (req, res) => {
  try {
    const Payment = require("../models/Payment");
    const { page = 1, limit = 20, status, type } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const payments = await Payment.find(query)
      .populate("payer", "name email profile.companyName")
      .populate("payee", "name email")
      .populate("gig", "title")
      .populate("project", "title")
      .sort("-createdAt")
      .skip(skip)
      .limit(parseInt(limit));

    const totalPayments = await Payment.countDocuments(query);

    res.status(200).json({
      success: true,
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalPayments / limit),
        totalPayments,
        hasNext: page < Math.ceil(totalPayments / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch payments",
    });
  }
});

// Analytics and reports
router.get("/analytics/users", async (req, res) => {
  try {
    const User = require("../models/User");
    const { timeframe = "30d" } = req.query;

    // Calculate date threshold
    let dateThreshold;
    switch (timeframe) {
      case "7d":
        dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        dateThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const userStats = await User.aggregate([
      {
        $facet: {
          totalUsers: [{ $count: "count" }],
          newUsers: [
            { $match: { createdAt: { $gte: dateThreshold } } },
            { $count: "count" },
          ],
          usersByRole: [{ $group: { _id: "$role", count: { $sum: 1 } } }],
          activeUsers: [{ $match: { isActive: true } }, { $count: "count" }],
          verifiedUsers: [{ $match: { verified: true } }, { $count: "count" }],
        },
      },
    ]);

    res.status(200).json({
      success: true,
      analytics: userStats[0],
      timeframe,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch user analytics",
    });
  }
});

router.get("/analytics/revenue", async (req, res) => {
  try {
    const Payment = require("../models/Payment");
    const { timeframe = "30d" } = req.query;

    let dateThreshold;
    switch (timeframe) {
      case "7d":
        dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        dateThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const revenueStats = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: dateThreshold },
          status: "completed",
        },
      },
      {
        $facet: {
          totalRevenue: [{ $group: { _id: null, total: { $sum: "$amount" } } }],
          revenueByType: [
            {
              $group: {
                _id: "$type",
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
          ],
          dailyRevenue: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    res.status(200).json({
      success: true,
      analytics: revenueStats[0],
      timeframe,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch revenue analytics",
    });
  }
});

// Content moderation
router.get("/posts", validatePagination, async (req, res) => {
  try {
    const Post = require("../models/Post");
    const { page = 1, limit = 20, status, reported } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status === "active") query.isActive = true;
    if (status === "inactive") query.isActive = false;
    if (reported === "true") query.isReported = true;

    const posts = await Post.find(query)
      .populate("author", "name email image")
      .sort("-createdAt")
      .skip(skip)
      .limit(parseInt(limit));

    const totalPosts = await Post.countDocuments(query);

    res.status(200).json({
      success: true,
      posts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalPosts / limit),
        totalPosts,
        hasNext: page < Math.ceil(totalPosts / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch posts",
    });
  }
});

router.put(
  "/posts/:postId/moderate",
  validateObjectId("postId"),
  async (req, res) => {
    try {
      const Post = require("../models/Post");
      const { action, reason } = req.body; // action: 'approve', 'remove', 'flag'

      const post = await Post.findById(req.params.postId);
      if (!post) {
        return res.status(404).json({
          success: false,
          error: "Post not found",
        });
      }

      switch (action) {
        case "approve":
          post.isActive = true;
          post.moderationStatus = "approved";
          break;
        case "remove":
          post.isActive = false;
          post.isDeleted = true;
          post.deletedAt = new Date();
          post.moderationStatus = "removed";
          break;
        case "flag":
          post.isReported = true;
          post.moderationStatus = "flagged";
          break;
      }

      post.moderatedBy = req.user._id;
      post.moderatedAt = new Date();
      post.moderationReason = reason;

      await post.save();

      res.status(200).json({
        success: true,
        message: `Post ${action}d successfully`,
        post,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to moderate post",
      });
    }
  }
);

// System settings and configuration
router.get("/settings", async (req, res) => {
  try {
    // This would typically fetch from a settings collection
    const settings = {
      platformCommission: {
        freelancer: 10, // 10%
        company: 5, // 5%
      },
      paymentSettings: {
        minWithdrawal: 1000,
        processingTime: "2-3 business days",
      },
      subscriptionPlans: {
        freelancer: {
          monthly: 99,
          yearly: 999,
          lifetime: 4999,
        },
        hiring: {
          monthly: 199,
          yearly: 1999,
          lifetime: 9999,
        },
      },
    };

    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch settings",
    });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const { settings } = req.body;

    // This would typically update a settings collection
    // For now, just return success
    res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to update settings",
    });
  }
});

// System health and monitoring
router.get("/health", async (req, res) => {
  try {
    const mongoose = require("mongoose");

    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: {
        status:
          mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        name: mongoose.connection.name,
      },
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    };

    res.status(200).json({
      success: true,
      health,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch health status",
    });
  }
});

module.exports = router;

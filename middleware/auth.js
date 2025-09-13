// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        error: "Access denied. No token provided.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user by ID from token
    let user = await User.findById(decoded.userId || decoded.id).select(
      "-password"
    );

    if (!user) {
      return res.status(401).json({
        error: "Invalid token. User not found.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid token.",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Token expired.",
      });
    }

    res.status(500).json({
      error: "Authentication error.",
    });
  }
};

// Admin authentication middleware
const adminAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        error: "Access denied. Admin token required.",
      });
    }

    const adminSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET + "_admin";
    const decoded = jwt.verify(token, adminSecret);

    // Check if it's an admin token
    if (!decoded.isAdmin) {
      return res.status(401).json({
        error: "Invalid admin token.",
      });
    }

    // Handle default admin
    if (decoded.adminId === "admin_default") {
      req.user = {
        _id: "admin_default",
        name: "Default Admin",
        email: "admin@gmail.com",
        role: "admin",
        isActive: true
      };
      return next();
    }

    // Find admin user by ID from token
    let admin = await User.findById(decoded.adminId).select("-password");

    if (!admin || admin.role !== "admin") {
      return res.status(401).json({
        error: "Invalid admin token. Admin not found.",
      });
    }

    if (!admin.isActive) {
      return res.status(401).json({
        error: "Admin account is deactivated.",
      });
    }

    req.user = admin;
    next();
  } catch (error) {
    console.error("Admin auth middleware error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid admin token.",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Admin token expired.",
      });
    }

    res.status(500).json({
      error: "Admin authentication error.",
    });
  }
};

// Middleware to check if user has specific role
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const userRoles = Array.isArray(roles) ? roles : [roles];

    if (!userRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Access denied. Insufficient permissions.",
      });
    }

    next();
  };
};

// Middleware to check if profile is complete
const requireCompleteProfile = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  if (!req.user.isProfileComplete()) {
    return res.status(403).json({
      error: "Profile completion required.",
      requiresProfileCompletion: true,
    });
  }

  next();
};

// Optional auth middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId || decoded.id).select(
      "-password"
    );

    req.user = user;
    next();
  } catch (error) {
    // In optional auth, we continue even if token is invalid
    req.user = null;
    next();
  }
};

// Middleware to check if user is verified
const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  if (!req.user.verified && !req.user.isVerified) {
    return res.status(403).json({
      error: "Email verification required.",
      requiresVerification: true,
    });
  }

  next();
};

// Middleware to check if user is active
const requireActive = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  if (!req.user.isActive) {
    return res.status(403).json({
      error: "Account is deactivated. Please contact support.",
    });
  }

  next();
};

// Middleware to check subscription status
const requireSubscription = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  // Add subscription check logic here if needed
  // For now, we'll just pass through
  next();
};

// Admin only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: "Access denied. Admin privileges required.",
    });
  }

  next();
};

// Freelancer only middleware
const requireFreelancer = requireRole("freelancer");

// Hiring manager only middleware
const requireHiring = requireRole("hiring");

// Freelancer or hiring middleware
const requireFreelancerOrHiring = requireRole(["freelancer", "hiring"]);

module.exports = {
  authMiddleware,
  adminAuthMiddleware,
  requireRole,
  requireCompleteProfile,
  optionalAuth,
  requireVerified,
  requireActive,
  requireSubscription,
  requireAdmin,
  requireFreelancer,
  requireHiring,
  requireFreelancerOrHiring,
};

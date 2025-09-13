// controllers/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const { AppError, catchAsync } = require("../middleware/errorHandler");

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// Generate admin JWT token with different secret
const generateAdminToken = (adminId) => {
  return jwt.sign(
    { adminId, isAdmin: true },
    process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET + "_admin",
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
};

// Send token response
const sendTokenResponse = (user, statusCode, res, message) => {
  const token = generateToken(user._id);

  // Remove password from output
  const userResponse = user.toObject();
  delete userResponse.password;

  res.status(statusCode).json({
    success: true,
    message,
    token,
    user: userResponse,
  });
};

// Send admin token response
const sendAdminTokenResponse = (admin, statusCode, res, message) => {
  const token = generateAdminToken(admin._id);

  // Remove password from output
  const adminResponse = admin.toObject();
  delete adminResponse.password;

  res.status(statusCode).json({
    success: true,
    message,
    token,
    admin: adminResponse,
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = catchAsync(async (req, res, next) => {
  const { name, email, password, role, provider = "email" } = req.body;

  console.log("[Auth] Registration attempt:", { name, email, role, provider });

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(
      new AppError("User already exists with this email address", 400)
    );
  }

  // Create new user
  const user = await User.create({
    name,
    email,
    password,
    role,
    provider,
    verified: provider === "google",
    isVerified: provider === "google",
  });

  console.log("[Auth] User created successfully:", user._id);

  sendTokenResponse(user, 201, res, "User registered successfully");
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  console.log("[Auth] Login attempt for:", email);

  // Find user by email and include password
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return next(new AppError("Invalid email or password", 401));
  }

  // Check password (skip for Google OAuth users)
  if (user.provider === "email") {
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return next(new AppError("Invalid email or password", 401));
    }
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  console.log("[Auth] Login successful for:", user._id);

  sendTokenResponse(user, 200, res, "Login successful");
});

// @desc    Google OAuth authentication
// @route   POST /api/auth/google
// @access  Public
const googleAuth = catchAsync(async (req, res, next) => {
  const { name, email, googleId, image, role } = req.body;

  console.log("[Auth] Google OAuth attempt:", { email, role });

  // Check if user exists
  let user = await User.findOne({
    $or: [{ email }, { googleId }],
  });

  if (user) {
    // Update existing user
    user.name = name;
    user.image = image || user.image;
    user.googleId = googleId;
    user.provider = "google";
    user.verified = true;
    user.isVerified = true;
    user.lastLogin = new Date();

    if (!user.role && role) {
      user.role = role;
    }

    await user.save({ validateBeforeSave: false });
  } else {
    // Create new user
    user = await User.create({
      name,
      email,
      googleId,
      image,
      role,
      provider: "google",
      verified: true,
      isVerified: true,
      lastLogin: new Date(),
    });
  }

  console.log("[Auth] Google OAuth successful for:", user._id);

  sendTokenResponse(user, 200, res, "Google authentication successful");
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id)
    .select("-password")
    .populate("followers", "name image role")
    .populate("following", "name image role");

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  res.status(200).json({
    success: true,
    user,
    isProfileComplete: user.isProfileComplete(),
  });
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError("Email is required", 400));
  }

  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal whether email exists
    return res.status(200).json({
      success: true,
      message: "If the email exists, a password reset link has been sent",
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

  console.log("[Auth] Password reset requested for:", email);
  console.log("[Auth] Reset URL:", resetUrl);

  // TODO: Send email with reset link
  // await sendEmail({
  //   to: user.email,
  //   subject: 'Password Reset',
  //   template: 'resetPassword',
  //   data: { name: user.name, resetUrl }
  // });

  res.status(200).json({
    success: true,
    message: "Password reset link sent to email",
    ...(process.env.NODE_ENV === "development" && { resetUrl }),
  });
});

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = catchAsync(async (req, res, next) => {
  const { password } = req.body;
  const { token } = req.params;

  if (!password || password.length < 6) {
    return next(
      new AppError("Password must be at least 6 characters long", 400)
    );
  }

  // Hash token
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // Find user with valid token
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError("Invalid or expired reset token", 400));
  }

  // Update password
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;

  await user.save();

  console.log("[Auth] Password reset successful for:", user.email);

  res.status(200).json({
    success: true,
    message: "Password reset successfully",
  });
});

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(
      new AppError("Current password and new password are required", 400)
    );
  }

  if (newPassword.length < 6) {
    return next(
      new AppError("New password must be at least 6 characters long", 400)
    );
  }

  const user = await User.findById(req.user._id).select("+password");

  // Check current password (skip for Google OAuth users)
  if (user.provider === "email") {
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return next(new AppError("Current password is incorrect", 400));
    }
  }

  // Update password
  user.password = newPassword;
  await user.save();

  console.log("[Auth] Password changed for:", user.email);

  res.status(200).json({
    success: true,
    message: "Password changed successfully",
  });
});

// @desc    Send email verification
// @route   POST /api/auth/verify-email
// @access  Private
const sendEmailVerification = catchAsync(async (req, res, next) => {
  if (req.user.verified) {
    return next(new AppError("Email is already verified", 400));
  }

  // Generate verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");
  req.user.verificationToken = verificationToken;
  await req.user.save({ validateBeforeSave: false });

  const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;

  console.log("[Auth] Email verification requested for:", req.user.email);
  console.log("[Auth] Verification URL:", verifyUrl);

  // TODO: Send verification email
  // await sendEmail({
  //   to: req.user.email,
  //   subject: 'Verify Your Email',
  //   template: 'verifyEmail',
  //   data: { name: req.user.name, verifyUrl }
  // });

  res.status(200).json({
    success: true,
    message: "Verification email sent",
    ...(process.env.NODE_ENV === "development" && { verifyUrl }),
  });
});

// @desc    Verify email address
// @route   GET /api/auth/verify-email/:token
// @access  Public
const verifyEmail = catchAsync(async (req, res, next) => {
  const { token } = req.params;

  const user = await User.findOne({ verificationToken: token });
  if (!user) {
    return next(new AppError("Invalid verification token", 400));
  }

  user.verified = true;
  user.isVerified = true;
  user.verificationToken = undefined;
  await user.save({ validateBeforeSave: false });

  console.log("[Auth] Email verified for:", user.email);

  res.status(200).json({
    success: true,
    message: "Email verified successfully",
  });
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = catchAsync(async (req, res, next) => {
  console.log("[Auth] User logged out:", req.user._id);

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

// @desc    Refresh token
// @route   POST /api/auth/refresh-token
// @access  Private
const refreshToken = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  sendTokenResponse(user, 200, res, "Token refreshed successfully");
});

// @desc    Admin login
// @route   POST /api/auth/admin/login
// @access  Public
const adminLogin = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // console.log("[Auth] Admin login attempt for:", email);

  // Check if it's the default admin credentials
  const isDefaultAdmin = 
    email.toLowerCase() === "admin@gmail.com" && 
    password === "admin@unjob.ai";

  // console.log("[Auth] Is default admin:", isDefaultAdmin);

  if (isDefaultAdmin) {
    // Create a temporary admin object for the default admin
    const defaultAdmin = {
      _id: "admin_default",
      name: "Default Admin",
      email: "admin@gmail.com",
      role: "admin",
      isActive: true,
      toObject: function() {
        return {
          _id: this._id,
          name: this.name,
          email: this.email,
          role: this.role,
          isActive: this.isActive
        };
      }
    };
    
    // console.log("[Auth] Default admin login successful");
    return sendAdminTokenResponse(defaultAdmin, 200, res, "Admin login successful");
  }

  // Find admin user by email and include password
  const admin = await User.findOne({ 
    email, 
    role: "admin" 
  }).select("+password");

  if (!admin) {
    return next(new AppError("Invalid admin credentials", 401));
  }

  // Check password
  const isPasswordValid = await admin.comparePassword(password);
  if (!isPasswordValid) {
    return next(new AppError("Invalid admin credentials", 401));
  }

  // Check if admin is active
  if (!admin.isActive) {
    return next(new AppError("Admin account is deactivated", 401));
  }

  // Update last login
  admin.lastLogin = new Date();
  await admin.save({ validateBeforeSave: false });

  // console.log("[Auth] Admin login successful for:", admin._id);

  sendAdminTokenResponse(admin, 200, res, "Admin login successful");
});

// @desc    Initialize default admin (for setup purposes)
// @route   POST /api/auth/admin/initialize
// @access  Public (should be removed in production)
const initializeAdmin = catchAsync(async (req, res, next) => {
  // Check if admin already exists
  const existingAdmin = await User.findOne({ role: "admin" });
  if (existingAdmin) {
    return next(new AppError("Admin already exists", 400));
  }

  // Create default admin user
  const admin = await User.create({
    name: "Default Admin",
    email: "admin@gmail.com",
    password: "admin@unjob.ai",
    role: "admin",
    provider: "email",
    verified: true,
    isVerified: true,
    isActive: true,
  });

  // console.log("[Auth] Default admin created:", admin._id);

  sendAdminTokenResponse(admin, 201, res, "Default admin created successfully");
});

module.exports = {
  register,
  login,
  googleAuth,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
  sendEmailVerification,
  verifyEmail,
  logout,
  refreshToken,
  adminLogin,
  initializeAdmin,
};

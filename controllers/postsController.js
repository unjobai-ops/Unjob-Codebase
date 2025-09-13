// controllers/postController.js
const Post = require("../models/Post");
const User = require("../models/User");
const { AppError, catchAsync } = require("../middleware/errorHandler");

// @desc    Create a new post
// @route   POST /api/posts
// @access  Private
const createPost = catchAsync(async (req, res, next) => {
  const {
    title,
    description,
    category,
    subCategory,
    tags,
    project,
    postType,
    portfolioData,
  } = req.body;

  // Handle uploaded images
  let images = [];
  if (req.files && req.files.length > 0) {
    images = req.files.map((file) => file.path || file.secure_url);
  }

  const postData = {
    title,
    description,
    category,
    subCategory,
    tags: tags || [],
    project: project || "",
    postType: postType || "post",
    images,
    author: req.user._id,
  };

  // Add portfolio data if it's a portfolio post
  if (postType === "portfolio" && portfolioData) {
    postData.portfolioData = {
      ...portfolioData,
      isPortfolioItem: true,
    };
  }

  const post = await Post.create(postData);

  // Update user's posts count
  await User.findByIdAndUpdate(req.user._id, {
    $inc: { "stats.postsCount": 1 },
  });

  // Populate author info
  await post.populate("author", "name image role");

  res.status(201).json({
    success: true,
    message: "Post created successfully",
    post,
  });
});

// @desc    Get all posts with pagination and filters
// @route   GET /api/posts
// @access  Private
const getAllPosts = catchAsync(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    category,
    subCategory,
    postType,
    author,
    tags,
    sort = "-createdAt",
  } = req.query;

  const skip = (page - 1) * limit;

  // Build filter query
  const filterQuery = {
    isActive: true,
    isDeleted: false,
  };

  if (category) filterQuery.category = category;
  if (subCategory) filterQuery.subCategory = subCategory;
  if (postType) filterQuery.postType = postType;
  if (author) filterQuery.author = author;
  if (tags) {
    const tagsArray = tags.split(",");
    filterQuery.tags = { $in: tagsArray };
  }

  const posts = await Post.find(filterQuery)
    .populate("author", "name image role profile.companyName")
    .populate("comments.user", "name image")
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const totalPosts = await Post.countDocuments(filterQuery);

  // Add user interaction data
  const postsWithInteractions = posts.map((post) => {
    const postObj = post.toObject();
    postObj.isLiked = post.likes.some(
      (like) => like.user.toString() === req.user._id.toString()
    );
    return postObj;
  });

  res.status(200).json({
    success: true,
    posts: postsWithInteractions,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      hasNext: page < Math.ceil(totalPosts / limit),
      hasPrev: page > 1,
    },
  });
});

// @desc    Get post by ID
// @route   GET /api/posts/:id
// @access  Private
const getPostById = catchAsync(async (req, res, next) => {
  const post = await Post.findById(req.params.id)
    .populate("author", "name image role profile.companyName profile.bio")
    .populate("comments.user", "name image role")
    .populate("likes.user", "name image");

  if (!post || !post.isActive || post.isDeleted) {
    return next(new AppError("Post not found", 404));
  }

  // Increment view count
  await post.incrementViews();

  // Check if user has liked the post
  const isLiked = post.likes.some(
    (like) => like.user._id.toString() === req.user._id.toString()
  );

  res.status(200).json({
    success: true,
    post: {
      ...post.toObject(),
      isLiked,
    },
  });
});

// @desc    Update post
// @route   PUT /api/posts/:id
// @access  Private
const updatePost = catchAsync(async (req, res, next) => {
  const {
    title,
    description,
    category,
    subCategory,
    tags,
    project,
    portfolioData,
  } = req.body;

  const post = await Post.findById(req.params.id);

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Check if user owns the post
  if (post.author.toString() !== req.user._id.toString()) {
    return next(new AppError("Not authorized to update this post", 403));
  }

  // Handle new uploaded images
  let newImages = [];
  if (req.files && req.files.length > 0) {
    newImages = req.files.map((file) => file.path || file.secure_url);
  }

  // Update post fields
  post.title = title || post.title;
  post.description = description || post.description;
  post.category = category || post.category;
  post.subCategory = subCategory || post.subCategory;
  post.tags = tags || post.tags;
  post.project = project || post.project;

  // Add new images to existing ones
  if (newImages.length > 0) {
    post.images = [...post.images, ...newImages];
  }

  // Update portfolio data if provided
  if (portfolioData && post.postType === "portfolio") {
    post.portfolioData = { ...post.portfolioData, ...portfolioData };
  }

  await post.save();

  await post.populate("author", "name image role");

  res.status(200).json({
    success: true,
    message: "Post updated successfully",
    post,
  });
});

// @desc    Delete post
// @route   DELETE /api/posts/:id
// @access  Private
const deletePost = catchAsync(async (req, res, next) => {
  const post = await Post.findById(req.params.id);
  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  // Ensure post.author is compared correctly
  const postAuthorId = post.author._id ? post.author._id.toString() : post.author.toString();
  if (postAuthorId !== req.user._id.toString()) {
    return next(new AppError("Not authorized to delete this post", 403));
  }

  // Hard delete: remove the post document from the collection
  await Post.deleteOne({ _id: post._id });

  // Update user stats only if field exists
  await User.findByIdAndUpdate(req.user._id, {
    $inc: { "stats.postsCount": -1 },
  }, { new: true, strict: false });

  res.status(200).json({
    success: true,
    message: "Post deleted successfully",
  });
});


// @desc    Like/Unlike a post
// @route   POST /api/posts/:id/like
// @access  Private
const toggleLike = catchAsync(async (req, res, next) => {
  const post = await Post.findById(req.params.id);

  if (!post || !post.isActive || post.isDeleted) {
    return next(new AppError("Post not found", 404));
  }

  const userId = req.user._id;
  const existingLike = post.likes.find(
    (like) => like.user.toString() === userId.toString()
  );

  let message;

  if (existingLike) {
    // Unlike the post
    await post.removeLike(userId);
    message = "Post unliked successfully";
  } else {
    // Like the post
    await post.addLike(userId);
    message = "Post liked successfully";
  }

  res.status(200).json({
    success: true,
    message,
    likesCount: post.likesCount,
    isLiked: !existingLike,
  });
});

// @desc    Add comment to post
// @route   POST /api/posts/:id/comments
// @access  Private
const addComment = catchAsync(async (req, res, next) => {
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return next(new AppError("Comment content is required", 400));
  }

  const post = await Post.findById(req.params.id);

  if (!post || !post.isActive || post.isDeleted) {
    return next(new AppError("Post not found", 404));
  }

  await post.addComment(req.user._id, content.trim());

  // Populate the new comment
  await post.populate("comments.user", "name image role");

  const newComment = post.comments[post.comments.length - 1];

  res.status(201).json({
    success: true,
    message: "Comment added successfully",
    comment: newComment,
    commentsCount: post.commentsCount,
  });
});

// @desc    Delete comment
// @route   DELETE /api/posts/:id/comments/:commentId
// @access  Private
const deleteComment = catchAsync(async (req, res, next) => {
  const { id: postId, commentId } = req.params;

  const post = await Post.findById(postId);

  if (!post) {
    return next(new AppError("Post not found", 404));
  }

  const comment = post.comments.find(
    (c) => c._id.toString() === commentId.toString()
  );

  if (!comment) {
    return next(new AppError("Comment not found", 404));
  }

  // Check if user owns the comment or is the post author
  if (
    comment.user.toString() !== req.user._id.toString() &&
    post.author.toString() !== req.user._id.toString()
  ) {
    return next(new AppError("Not authorized to delete this comment", 403));
  }

  // Remove the comment
  post.comments = post.comments.filter(
    (c) => c._id.toString() !== commentId.toString()
  );

  // Update comments count
  post.commentsCount = post.comments.length;

  await post.save();

  res.status(200).json({
    success: true,
    message: "Comment deleted successfully",
  });
});


// @desc    Get user's posts
// @route   GET /api/posts/user/:userId
// @access  Private
const getUserPosts = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { page = 1, limit = 10, postType } = req.query;
  const skip = (page - 1) * limit;

  const filterQuery = {
    author: userId,
    isActive: true,
    isDeleted: false,
  };

  if (postType) {
    filterQuery.postType = postType;
  }

  const posts = await Post.find(filterQuery)
    .populate("author", "name image role")
    .sort("-createdAt")
    .skip(skip)
    .limit(parseInt(limit));

  const totalPosts = await Post.countDocuments(filterQuery);

  // Add user interaction data
  const postsWithInteractions = posts.map((post) => {
    const postObj = post.toObject();
    postObj.isLiked = post.likes.some(
      (like) => like.user.toString() === req.user._id.toString()
    );
    return postObj;
  });

  res.status(200).json({
    success: true,
    posts: postsWithInteractions,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      hasNext: page < Math.ceil(totalPosts / limit),
      hasPrev: page > 1,
    },
  });
});

// @desc    Get portfolio posts
// @route   GET /api/posts/portfolio
// @access  Private
const getPortfolioPosts = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10, author, category, featured } = req.query;
  const skip = (page - 1) * limit;

  const filterQuery = {
  postType: "portfolio",
  isActive: true,
  isDeleted: false,
};

  if (author) filterQuery.author = author;
  if (category) filterQuery.category = category;
  if (featured === "true") filterQuery["portfolioData.featured"] = true;

  const posts = await Post.find(filterQuery)
    .populate("author", "name image role profile.bio profile.companyName")
    .sort("-createdAt")
    .skip(skip)
    .limit(parseInt(limit));

  const totalPosts = await Post.countDocuments(filterQuery);

  res.status(200).json({
    success: true,
    portfolioPosts: posts,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      hasNext: page < Math.ceil(totalPosts / limit),
      hasPrev: page > 1,
    },
  });
});

// @desc    Search posts
// @route   GET /api/posts/search
// @access  Private
const searchPosts = catchAsync(async (req, res, next) => {
  const { q, category, tags, author, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  if (!q || q.trim().length === 0) {
    return next(new AppError("Search query is required", 400));
  }

  const searchQuery = {
    isActive: true,
    isDeleted: false,
    $or: [
      { title: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
      { tags: { $in: [new RegExp(q, "i")] } },
    ],
  };

  if (category) searchQuery.category = category;
  if (author) searchQuery.author = author;
  if (tags) {
    const tagsArray = tags.split(",");
    searchQuery.tags = { $in: tagsArray };
  }

  const posts = await Post.find(searchQuery)
    .populate("author", "name image role")
    .sort("-createdAt")
    .skip(skip)
    .limit(parseInt(limit));

  const totalPosts = await Post.countDocuments(searchQuery);

  // Add user interaction data
  const postsWithInteractions = posts.map((post) => {
    const postObj = post.toObject();
    postObj.isLiked = post.likes.some(
      (like) => like.user.toString() === req.user._id.toString()
    );
    return postObj;
  });

  res.status(200).json({
    success: true,
    posts: postsWithInteractions,
    searchQuery: q,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      hasNext: page < Math.ceil(totalPosts / limit),
      hasPrev: page > 1,
    },
  });
});

// @desc    Get trending posts
// @route   GET /api/posts/trending
// @access  Private
const getTrendingPosts = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10, timeframe = "7d" } = req.query;
  const skip = (page - 1) * limit;

  // Calculate date threshold based on timeframe
  let dateThreshold;
  switch (timeframe) {
    case "24h":
      dateThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  const posts = await Post.find({
    isActive: true,
    isDeleted: false,
    createdAt: { $gte: dateThreshold },
  })
    .populate("author", "name image role")
    .sort("-likesCount -commentsCount -viewsCount -createdAt")
    .skip(skip)
    .limit(parseInt(limit));

  const totalPosts = await Post.countDocuments({
    isActive: true,
    isDeleted: false,
    createdAt: { $gte: dateThreshold },
  });

  // Add user interaction data
  const postsWithInteractions = posts.map((post) => {
    const postObj = post.toObject();
    postObj.isLiked = post.likes.some(
      (like) => like.user.toString() === req.user._id.toString()
    );
    return postObj;
  });

  res.status(200).json({
    success: true,
    posts: postsWithInteractions,
    timeframe,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
      hasNext: page < Math.ceil(totalPosts / limit),
      hasPrev: page > 1,
    },
  });
});

module.exports = {
  createPost,
  getAllPosts,
  getPostById,
  updatePost,
  deletePost,
  toggleLike,
  addComment,
  deleteComment,
  getUserPosts,
  getPortfolioPosts,
  searchPosts,
  getTrendingPosts,
};

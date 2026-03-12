const express = require("express");
const {
  createProduct,
  getProducts,
  updateProduct,
  deleteProduct,
} = require("../controller/product.controller");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");

const router = express.Router();

// Public: anyone can view products; auth only needed for admin CRUD
router.get("/", getProducts);
router.post("/", authenticate, authorizeRoles("Admin"), upload.single("image"), createProduct);
router.put("/:id", authenticate, authorizeRoles("Admin"), upload.single("image"), updateProduct);
router.delete("/:id", authenticate, authorizeRoles("Admin"), deleteProduct);

module.exports = router;

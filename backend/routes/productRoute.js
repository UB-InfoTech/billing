// const express = require('express');
// const {
//     getProducts,
//     getProductById,
//     createProduct,
//     updateProduct,
//     deleteProduct,
//     createProductReview,
//     getTopProducts,
//     getProductReviews,
//     deleteProductReview,
// } = require('../controllers/productController.js');
// const { protect, admin } = require('../middleware/authMiddleware');
// const router = express.Router();

// // Route to get all products
// router.route('/').get(getProducts).post(protect, admin, createProduct);

// // Route to get, update, and delete a product by ID
// router
//     .route('/:id')
//     .get(getProductById)
//     .put(protect, admin, updateProduct)
//     .delete(protect, admin, deleteProduct);

// // Route to create a product review
// router.route('/:id/reviews').post(protect, createProductReview);

// // Route to get top products
// router.route('/top').get(getTopProducts);

// // Route to get product reviews and delete a review
// router
//     .route('/:id/reviews')
//     .get(protect, getProductReviews)
//     .delete(protect, deleteProductReview);

// // Export the router
// module.exports = router;


const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const productController = require('../controllers/productController');
// const upload = require('../middleware/uploadMiddleware');

// const barcode = require('../barcodes')

// @route /api/products
router
    .route('/')
    .get(productController.getProducts);
    // .get(productController.getGenerateBarcodeImage); // productController.getProducts
    // .get(productController.getProducts)

// .post(productController.createProduct);

// @route /api/products/:id
router
    .route('/:id')
    .get(productController.getProductById)
    .put(productController.updateProduct)
    .delete(productController.deleteProduct);

    // router.get('/barcode', async (req, res) => {
    //     try {
    //         const barcodeimg = await barcode.find();
    //         res.json(barcodeimg);
    //     } catch (err) {
    //         res.status(500).json({ message: err.message });
    //     }
    // });

router.post(
    '/',
    // upload.array('images', 5), // max 5 images
    productController.createProduct
);


router.get('/barcode/:code', async (req, res) => {
    const product = await Product.findOne({ productCode: req.params.code });

    if (!product) return res.status(404).json({ message: 'Not found' });
    res.json({ product });
});

module.exports = router;

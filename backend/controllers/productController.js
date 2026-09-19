const Product = require('../models/Product');
// const generateBarcode = require('../utils/generateBarcode');
// const images = req.files.map(file => file.path); // Cloudinary URLs

// const io = req.app.get('io');


const generateBarcodeImage = require('../utils/generateBarcodeImage');

// io.emit('stockUpdate', {
//     productId: updated._id,
//     productCode: updated.productCode,
//     stock: updated.stock
//   });  

exports.createProduct = async (req, res) => {
    try {
        const {
            productName, description, rate, designNo,
            // quantity, serialNumber, purchaseDate, purchasePrice,
            // rawMaterials, stock, images
        } = req.body;
        
        // Auto-generate productCode
        const productCode = 'P' + Date.now().toString().slice(-6);
        
        // Barcode (optional future use)
        // // const barcode = generateBarcode(productCode);
        // const barcode = await generateBarcodeImage(productCode);
        // Optionally upload the barcode to Cloudinary and save the URL.

    const product = new Product({
      productName,
      productCode,
      description,
      rate,
      designNo,
      // quantity,
      // // serialNumber,
      // // purchaseDate,
      // // purchasePrice,
      // // rawMaterials,
      // // stock,
      // images: req.files.map(file => file.path), // Assuming you are using multer for file uploads
      // barcode
    });

    await product.save();
    res.status(201).json({ message: 'Product created', product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

exports.getGenerateBarcodeImage = async (req, res) => {
  try {
    const { code } = req.params;
    const barcodeImage = await generateBarcodeImage(code);
    res.json({ barcodeImage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
}

exports.getProducts = async (req, res) => {
  try {
    // const { code } = req.params;
    // const barcodeImage = await generateBarcodeImage(code);

    const {
      search, sort = 'createdAt', order = 'desc',
      page = 1, limit = 10
    } = req.query;

    const query = search
      ? { productName: { $regex: search, $options: 'i' } }
      : {};

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort({ [sort]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // res.json({ total, page: +page, limit: +limit, products , barcodeImage });
    res.json({ total, page: +page, limit: +limit, products });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      ...req.body ,
      { new: true }
    );
   if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Updated', product: updated });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};
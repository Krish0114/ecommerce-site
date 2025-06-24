const paypalClient = require("../../helpers/paypal"); // Updated import
const Order = require("../../models/Order");
const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const paypal = require('@paypal/checkout-server-sdk');

const createOrder = async (req, res) => {
  try {
    const {
      userId,
      cartItems,
      addressInfo,
      orderStatus,
      paymentMethod,
      paymentStatus,
      totalAmount,
      orderDate,
      orderUpdateDate,
      paymentId,
      payerId,
      cartId,
    } = req.body;

    // Create temporary order with "pending" status
    const tempOrder = new Order({
      userId,
      cartId,
      cartItems,
      addressInfo,
      orderStatus: "pending",
      paymentMethod,
      paymentStatus: "pending",
      totalAmount,
      orderDate,
      orderUpdateDate,
    });
    await tempOrder.save();

    // Create PayPal order request
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: tempOrder._id.toString(), // Link to your order
        amount: {
          currency_code: "USD",
          value: totalAmount.toFixed(2),
          breakdown: {
            item_total: {
              currency_code: "USD",
              value: totalAmount.toFixed(2),
            },
          },
        },
        items: cartItems.map(item => ({
          name: item.title,
          sku: item.productId,
          unit_amount: {
            currency_code: "USD",
            value: item.price.toFixed(2),
          },
          quantity: item.quantity,
        })),
      }],
      application_context: {
        return_url: "http://localhost:5173/shop/paypal-return",
        cancel_url: "http://localhost:5173/shop/paypal-cancel",
        shipping_preference: "NO_SHIPPING", // Set to "GET_FROM_FILE" if you need shipping
      }
    });

    try {
      const response = await paypalClient().execute(request);
      const approvalUrl = response.result.links.find(link => link.rel === "approve").href;

      // Update temp order with PayPal ID
      tempOrder.paymentId = response.result.id;
      await tempOrder.save();

      res.status(200).json({
        success: true,
        approvalURL: approvalUrl,
        orderId: tempOrder._id,
      });
    } catch (error) {
      console.error("PayPal Error:", error);
      await Order.findByIdAndDelete(tempOrder._id); // Clean up if PayPal fails
      res.status(500).json({
        success: false,
        message: "Error creating PayPal payment",
        error: error.message,
      });
    }
  } catch (e) {
    console.error("Server Error:", e);
    res.status(500).json({
      success: false,
      message: "Server error occurred!",
    });
  }
};

const capturePayment = async (req, res) => {
  try {
    const { orderId } = req.body; // This is your MongoDB order ID
    const { token: paypalOrderId } = req.body; // This is the PayPal order ID from the return URL

    // 1. Capture payment with PayPal
    const request = new paypal.orders.OrdersCaptureRequest(paypalOrderId);
    request.requestBody({});

    const capture = await paypalClient().execute(request);
    
    // 2. Update order status
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // 3. Update inventory
    for (const item of order.cartItems) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${item.productId} not found`,
        });
      }
      if (product.totalStock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Not enough stock for ${product.title}`,
        });
      }
      product.totalStock -= item.quantity;
      await product.save();
    }

    // 4. Update order and clean up
    order.paymentStatus = "paid";
    order.orderStatus = "confirmed";
    order.paymentId = paypalOrderId;
    order.payerId = capture.result.payer.payer_id;
    await order.save();

    await Cart.findByIdAndDelete(order.cartId);

    res.status(200).json({
      success: true,
      message: "Order confirmed",
      data: order,
    });
  } catch (e) {
    console.error("Capture Error:", e);
    res.status(500).json({
      success: false,
      message: "Payment capture failed",
      error: e.message,
    });
  }
};
const getAllOrdersByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const orders = await Order.find({ userId });

    if (!orders.length) {
      return res.status(404).json({
        success: false,
        message: "No orders found!",
      });
    }

    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({
      success: false,
      message: "Some error occured!",
    });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found!",
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({
      success: false,
      message: "Some error occured!",
    });
  }
};

module.exports = {
  createOrder,
  capturePayment,
  getAllOrdersByUser,
  getOrderDetails,
};
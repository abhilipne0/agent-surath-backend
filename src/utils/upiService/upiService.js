const axios = require('axios');

const createPaymentOrder = async (data) => {
    console.log("data =>", data)
  const res = await axios.post(process.env.UPIGATEWAY_CREATE_URL, {
    key: process.env.UPIGATEWAY_API_KEY,
    ...data
  });
  // console.log("res.data =>", res.data)
  return res.data;
};

const checkOrderStatus = async (client_txn_id, txn_date) => {
  const res = await axios.post(process.env.UPIGATEWAY_STATUS_URL, {
    key: process.env.UPIGATEWAY_API_KEY,
    client_txn_id,
    txn_date
  });
  return res.data;
};

module.exports = { createPaymentOrder, checkOrderStatus };
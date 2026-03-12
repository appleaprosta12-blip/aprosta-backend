const mongoose = require('mongoose')
const dotenv = require('dotenv').config()

const connectDb = () => {
    try{
        mongoose.connect(process.env.ATLAS_URI)
        console.log('Mongodb is connected')
    } catch(error){
        console.error(" MongoDB connection error:", err);
        process.exit(1);
    }
}

module.exports = connectDb
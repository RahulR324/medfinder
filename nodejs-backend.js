const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// MongoDB Connection with error handling
const dns = require('dns').promises;

const connectDB = async () => {
    try {
        console.log('Starting connection process...');
        
        // Connection details
        const username = 'rahulratheeshp';
        const password = 'medfinder';
        const cluster = 'medfinder.0selh.mongodb.net';
        const database = 'medfinder';
        
        // Build connection string
        const uri = `mongodb+srv://${username}:${password}@${cluster}/${database}?tls=true&authSource=admin`;
        
        console.log('Attempting to connect to MongoDB Atlas...');
        console.log('Cluster:', cluster);
        console.log('Database:', database);
        
        // Connection options
        const options = {
            serverSelectionTimeoutMS: 15000,
            tls: true,
            tlsAllowInvalidCertificates: false,
            tlsAllowInvalidHostnames: false
        };
        
        const conn = await mongoose.connect(uri, options);
        
        console.log('Connection successful!');
        console.log(`Connected to database: ${conn.connection.name}`);
        console.log(`Host: ${conn.connection.host}`);
        
        // Test database access
        const collections = await conn.connection.db.listCollections().toArray();
        console.log('Available collections:', collections.map(c => c.name));
        
    } catch (err) {
        console.error('\nMongoDB Connection Error Details:');
        console.error('- Error Type:', err.name);
        console.error('- Message:', err.message);
        
        if (err.name === 'MongoServerSelectionError') {
            console.error('\nConnection Troubleshooting:');
            console.error('1. Verify network connectivity');
            console.error('2. Check MongoDB Atlas IP whitelist (your IP: 117.243.228.244)');
            console.error('3. Verify database credentials');
            console.error('4. Ensure MongoDB Atlas cluster is running');
            
            if (err.reason) {
                console.error('\nDetailed Error Information:');
                console.error('- Topology Type:', err.reason.type);
                console.error('- Server Count:', err.reason.servers.size);
                err.reason.servers.forEach((desc, host) => {
                    console.error(`\nServer ${host}:`);
                    console.error('  - Type:', desc.type);
                    console.error('  - Error:', desc.error?.message || 'No error message');
                });
            }
        }
        
        process.exit(1);
    }
};

// Read and parse sample data
const sampleData = JSON.parse(fs.readFileSync('sample.json', 'utf8'));

// MongoDB Schema
const storeSchema = new mongoose.Schema({
    name: String,
    address: String,
    district: String,
    locality: String,
    phone: String,
    latitude: Number,
    longitude: Number,
    medicines: [{ name: String, price: Number }],
    availability: Boolean,
    mapIframe: String,
    openingHours: String,
    rating: Number,
    reviewCount: Number,
    distance: Number
});

const Store = mongoose.model('Store', storeSchema);

// Function to insert test data
async function insertTestData() {
    try {
        // Drop existing collection
        await Store.collection.drop().catch(() => console.log('No existing collection to drop'));
        console.log('Cleared existing data');

        // Process stores data
        const storesWithMetadata = sampleData.stores.map(store => {
            // Convert medicines object to array of name/price objects
            const medicines = Object.entries(store.medicines).map(([name, price]) => ({
                name: name.toLowerCase(),
                price: price
            }));
            
            return {
                ...store,
                medicines,
                district: store.district.toLowerCase(),
                locality: store.locality.toLowerCase(),
                reviewCount: Math.floor(Math.random() * 200) + 50,
                distance: parseFloat((Math.random() * 5).toFixed(1))
            };
        });

        // Insert the stores data
        await Store.insertMany(storesWithMetadata);
        console.log(`Sample data inserted successfully! Added ${storesWithMetadata.length} stores.`);

        // Add common medicines to a separate collection
        if (sampleData.commonMedicines) {
            const commonMedicines = Object.entries(sampleData.commonMedicines).map(([name, price]) => ({
                name: name.toLowerCase(),
                price: price
            }));
            await mongoose.connection.db.collection('commonMedicines').drop().catch(() => {});
            await mongoose.connection.db.collection('commonMedicines').insertOne({ medicines: commonMedicines });
            console.log('Added common medicines list');
        }
    } catch (error) {
        console.error('Error inserting sample data:', error);
    }
}

// Connect to database and insert test data
connectDB().then(() => {
    insertTestData();
});

// API endpoint for search
app.post('/api/search', async (req, res) => {
    try {
        const { medicines, district, locality } = req.body;
        const searchMedicine = medicines.toLowerCase();
        
        // Create search query
        const query = {
            'medicines.name': { $regex: searchMedicine, $options: 'i' },
            district: district.toLowerCase(),
            locality: locality.toLowerCase()
        };

        // Find matching stores
        const stores = await Store.find(query);
        
        // Format response to show medicine prices
        const formattedStores = stores.map(store => {
            const storeObj = store.toObject();
            const matchingMedicine = storeObj.medicines.find(m => 
                m.name.toLowerCase().includes(searchMedicine)
            );
            return {
                ...storeObj,
                price: matchingMedicine ? matchingMedicine.price : null,
                medicines: storeObj.medicines.map(m => m.name) // Convert back to simple array for frontend
            };
        });

        const message = stores.length > 0 
            ? `Found ${stores.length} pharmacies with ${medicines}`
            : `No pharmacies found with ${medicines} in ${locality}, ${district}`;

        res.json({
            success: true,
            message: message,
            stores: formattedStores
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing search request',
            error: error.message
        });
    }
});

// API endpoint to get common medicines with prices
app.get('/api/common-medicines', async (req, res) => {
    try {
        const result = await mongoose.connection.db.collection('commonMedicines').findOne({});
        res.json({
            success: true,
            medicines: result ? result.medicines : []
        });
    } catch (error) {
        console.error('Error fetching common medicines:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching common medicines',
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
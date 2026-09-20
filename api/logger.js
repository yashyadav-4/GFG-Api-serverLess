const { MongoClient } = require('mongodb');

let mongoClient = null;

async function getDb(){
  const uri = process.env.MongoUrl || process.env.MONGODB_URI || process.env.MONGO_URI;
  if(!uri) return null;
  if(!mongoClient){
    mongoClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    await mongoClient.connect();
  }
  return mongoClient.db();
}

async function logErrorToAdmin({ source = 'GFG-Serverless', level = 'error', message, handle }){
  try{
    const db = await getDb();
    if(!db) return;

    await db.collection('errorlogs').insertOne({
      source,
      level,
      message: String(message || 'Unknown GFG error'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if(handle){
      await db.collection('gfgdatas').updateOne(
        { gfgHandle: { $regex: new RegExp(`^${handle}$`, 'i') } },
        {
          $set: {
            lastError: String(message || 'Error fetching GFG profile'),
            lastErrorAt: new Date(),
          },
        }
      ).catch(()=>{});
    }
  }catch(err){
    console.error('[GFG Serverless Logger] Could not persist to MongoDB:', err.message);
  }
}

module.exports = { logErrorToAdmin };

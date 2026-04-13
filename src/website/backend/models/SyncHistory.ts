// src/server/models/SyncHistory.ts
import mongoose from 'mongoose';

const syncHistorySchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true,
        index: true  // Add index for faster queries
    },
    deviceId: { 
        type: String, 
        required: true 
    },
    type: {
        type: String,
        enum: ['INITIAL_IMPORT', 'SYNC'],
        required: true
    },
    changesCount: { 
        type: Number, 
        required: true 
    },
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'PARTIAL'],
        required: true
    },
    details: {
        bookmarksProcessed: { type: Number, default: 0 },
        foldersProcessed: { type: Number, default: 0 },
        errors: [{ 
            type: String,
            itemId: String,
            message: String
        }]
    },
    metadata: {
        deviceInfo: {
            browser: String,
            browserVersion: String,
            deviceId: String,
            os: String,
            osVersion: String
        },
        userAgent: String,
        timestamp: Number
    }
}, {
    timestamps: true
});

// Add index for querying recent syncs
syncHistorySchema.index({ userId: 1, createdAt: -1 });

export const SyncHistory = mongoose.model('SyncHistory', syncHistorySchema);
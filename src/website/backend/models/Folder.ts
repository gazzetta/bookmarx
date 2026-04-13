// src/server/models/Folder.ts
import mongoose from 'mongoose';

const folderSchema = new mongoose.Schema({
    browserId: { type: String, required: true },  // Chrome's folder id
    userId: { type: String, required: true },     // Will use deviceId for now
    title: { type: String, required: true },
    parentId: { type: String },                   // Null for root folder
    index: { type: Number, required: true },
    dateAdded: { type: Number, required: true },
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
    },
    status: {
        type: String,
        enum: ['active', 'deleted'],
        default: 'active'
    },
    syncVersion: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true
});

export const Folder = mongoose.model('Folder', folderSchema);
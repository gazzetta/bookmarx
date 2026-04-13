// src/server/models/Bookmark.ts
import mongoose from 'mongoose';

const bookmarkSchema = new mongoose.Schema({
    browserId: { type: String, required: true },  // Chrome's bookmark id
    userId: { type: String, required: true },     // Will use deviceId for now
    url: { type: String, required: true },
    title: { type: String, required: true },
    parentId: { type: String, required: true },   // Chrome's folder id
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

export const Bookmark = mongoose.model('Bookmark', bookmarkSchema);

# BookMarx Software Design Document

## 1.0 System Overview
- Cross-browser bookmark synchronization system with cloud backup
- Three main components:
  1. Browser Extension (TypeScript)
  2. Website Frontend (React/Next.js)
  3. Backend Server (Express/Node.js)
- Freemium model with advanced features for paid users

## 2.0 Architecture
### 2.1 Data Structures
- Bookmark and folder schemas
- Sync protocols
- Version control
- Local/server storage design

### 2.2 API Design
- RESTful endpoints
- Authentication flows
- Data validation
- Rate limiting

### 2.3 Security
- Authentication system
- Token management
- Data encryption
- Session handling
- Social auth integration
- Device management

## 3.0 Extension
### 3.1 Browser Integration
- Background service
- Browser API integration
- Event handling
- Local storage management

### 3.2 Sync Protocol
- Vector clocks
- Conflict resolution
- Change compression
- Recovery mechanisms

### 3.3 Offline Support
- Operation queuing
- State management
- Recovery procedures

## 4.0 Database
### 4.1 Core Schema
- User management
- Bookmark storage
- Sync tracking
- Payment processing
- Backup system

### 4.2 Common Operations
- CRUD operations
- Sync operations
- Batch processing
- Query optimization

## 5.0 Error Handling
- Error categorization
- Recovery strategies
- User notification
- System monitoring

## Technical Stack
- Frontend Website: React/Next.js with shadcn/ui components
- Browser Extension: TypeScript with Chrome Extension APIs
- Backend: Express/Node.js with TypeScript
- Database: PostgreSQL
- Hosting: Hetzner (Ubuntu Server)

## Pricing Model
- Free Tier: Basic sync, manual control
- Pro Tier ($9.99/month, $99.99/year, $149.99/lifetime):
  - Automatic sync
  - Cloud backups
  - Priority support
  - Advanced features

## Development Status
Cores Completed:
1. Extension Core Functionality
2. Security Architecture
3. Sync Protocol
4. Database Schema
5. Error Handling Strategy

Next:
- Backend Server Implementation
- Frontend Website Development

This document serves as the master reference for the BookMarx project design. Each section has its own detailed documentation file with implementation specifics, code examples, and technical details.
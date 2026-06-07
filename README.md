# POS System - Touch-Friendly Point of Sale

A modern, touch-friendly Point of Sale (POS) system built with Node.js, Express, and SQLite (using sql.js). Perfect for small businesses, cafes, retail stores, and restaurants.

![POS System Screenshot](Screenshot%202026-06-07%20at%2012.14.28.png)

## Features

### Core Functionality
- **User Management**: Admin and cashier roles with secure authentication
- **Product Management**: Add, edit, and manage products with categories, pricing, and inventory tracking
- **Order Processing**: Complete sales with cash or card payments, automatic change calculation
- **Barcode Support**: Scan or enter barcodes to quickly add products
- **Receipt Generation**: Printable receipts with customizable footer messages

### Inventory & Reporting
- **Real-time Inventory**: Track stock levels with low-stock alerts
- **Sales Reports**: Daily, weekly, and monthly sales analytics
- **Top Products**: Identify best-selling items
- **User Performance**: Track sales by cashier/admin user
- **Storage Overview**: Complete inventory valuation and stock movement

### Administration
- **Category Management**: Organize products with customizable categories (colors and icons)
- **User Management**: Create and manage multiple users with different roles
- **Settings**: Configure store name, tax rates, currency, and system preferences
- **Image Upload**: Add product images via file upload

### Technical Features
- **SQLite Database**: Lightweight, file-based database (no separate database server required)
- **Responsive Design**: Works on tablets, touchscreens, and desktop browsers
- **Offline Capable**: Data persists locally in the browser
- **RESTful API**: Clean API endpoints for all operations

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation
1. Clone or download this repository
2. Navigate to the project directory:
   ```bash
   cd /path/to/pos-system
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application
- **Development mode**:
  ```bash
  npm run dev
  ```
- **Production mode**:
  ```bash
  npm start
  ```

The application will start on `http://localhost:3000`

### Default Login Credentials
- **Admin**: `admin` / `admin123`
- **Cashier**: `cashier` / `cash123`

## Project Structure

```
pos-system/
├── server.js          # Main server application
├── database.js        # Database initialization and management
├── pos.db             # SQLite database file (auto-created)
├── package.json       # Project dependencies and scripts
├── public/            # Frontend files
│   ├── index.html     # Main HTML file
│   ├── css/           # Stylesheets
│   ├── js/            # JavaScript files
│   └── uploads/       # Product images (auto-created)
└── README.md          # This file
```

## API Endpoints

The system provides a comprehensive RESTful API:

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user info
- `PUT /api/auth/password` - Change password

### Products
- `GET /api/products` - List products (with filtering)
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete/deactivate product

### Orders
- `POST /api/orders` - Create new order
- `GET /api/orders` - List orders (with filtering)
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id/refund` - Refund order

### Administration
- Users, categories, settings, and reports endpoints available
- Admin-only endpoints require admin role authentication

## Database Schema

The system uses the following tables:
- `users` - User accounts with roles
- `categories` - Product categories with styling
- `products` - Product catalog with inventory
- `orders` - Sales transactions
- `order_items` - Individual items in orders
- `settings` - System configuration

## Customization

### Settings Configuration
You can customize the system through the admin settings panel or directly in the database:
- Store name
- Tax rate (decimal format, e.g., 0.10 for 10%)
- Currency symbol
- Receipt footer message
- Low stock alert threshold

### Adding New Features
The codebase is modular and well-organized. To add new features:
1. Add new API endpoints in `server.js`
2. Update the database schema in `database.js` if needed
3. Add frontend components in `public/index.html` and `public/js/app.js`

## Security

- Passwords are hashed using SHA-256
- Session-based authentication with secure tokens
- Role-based access control (admin vs cashier)
- Input validation and sanitization
- File upload validation (image types only, 5MB limit)

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

For issues or feature requests, please open an issue on the repository.

---

**Note**: This is a file-based SQLite system. All data is stored in the `pos.db` file in the project root directory. Make sure to backup this file regularly for data safety.
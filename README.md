# Quiz Backend Server

This is the backend server for the Quiz application, built with Node.js, Express, and PostgreSQL.

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create a `.env` file in the root directory with the following variables:
   ```
   PORT=5000
   JWT_SECRET=your_jwt_secret_key
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_NAME=quiz_db
   DATABASE_USER=your_db_user
   DATABASE_PASSWORD=your_db_password
   NODE_ENV=development
   ```

3. **Set up the database**:
   - Create a new PostgreSQL database
   - Run the migrations:
     ```bash
     node migrations/run-migrations.js
     ```

4. **Seed the database** (optional):
   - Seed questions:
     ```bash
     node seed.js
     ```
   - Create an admin user:
     ```bash
     node seed_admin_user.js
     ```

## Available Scripts

- `npm start` - Start the server in production mode
- `npm run dev` - Start the server in development mode with nodemon
- `npm run migrate` - Run database migrations
- `npm run seed` - Seed the database with sample data
- `npm run check-db` - Check database connection and schema

## API Documentation

The API documentation is available at `/api-docs` when the server is running in development mode.

## Database Schema

The database schema is defined in `migrations/postgres.sql`. Key tables include:

- `users` - User accounts and authentication
- `questions` - Quiz questions and answers
- `seasons` - Quiz seasons/competitions
- `rounds` - Rounds within each season
- `quiz_results` - User quiz results

## Deployment

For production deployment:

1. Set `NODE_ENV=production` in your environment variables
2. Ensure all database connection details are correctly configured
3. Use a process manager like PM2 to keep the server running
4. Set up a reverse proxy (e.g., Nginx) for better performance and security

## License

This project is licensed under the MIT License.

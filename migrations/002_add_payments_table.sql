-- Create payments table to store payment information
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  transaction_id VARCHAR(255) NOT NULL UNIQUE,
  reference VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'MWK',
  status VARCHAR(50) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add index for faster lookups
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX idx_payments_reference ON payments(reference);
CREATE INDEX idx_payments_user_id ON payments(user_id);

-- Add comment to the table
COMMENT ON TABLE payments IS 'Stores payment transactions from PayChangu and other payment processors';

-- Add premium columns to users table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'is_premium') THEN
    ALTER TABLE users 
    ADD COLUMN is_premium BOOLEAN DEFAULT FALSE,
    ADD COLUMN premium_expires_at TIMESTAMP WITH TIME ZONE;
    
    COMMENT ON COLUMN users.is_premium IS 'Whether the user has an active premium subscription';
    COMMENT ON COLUMN users.premium_expires_at IS 'When the premium subscription expires';
    
    RAISE NOTICE 'Added premium columns to users table';
  END IF;
END $$;

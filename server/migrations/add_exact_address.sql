-- Migration: Add exact_address column to infants table
-- Author: Senior Full-Stack Engineer
-- Date: 2026-04-25

ALTER TABLE infants ADD COLUMN exact_address TEXT;

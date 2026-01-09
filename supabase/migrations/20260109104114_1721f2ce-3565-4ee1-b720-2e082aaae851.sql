-- Add is_rol_property column to properties table
ALTER TABLE public.properties 
ADD COLUMN is_rol_property boolean DEFAULT false;
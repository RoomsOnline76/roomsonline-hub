
# Fix: Blank PDF Brochure Download

## Problem Analysis

After investigating the edge function logs and codebase, I've identified **two issues** causing the blank PDF download:

### Issue 1: Missing Storage Bucket
- The `generate-itinerary-pdf` edge function attempts to upload HTML to a `documents` storage bucket
- **This bucket doesn't exist** - only these buckets exist: `addon-images`, `contracts`, `hero-videos`, `package-images`, `property-documents`, `property-images`, `signatures`, `template-images`
- The edge function falls back to returning HTML directly in the response (which is good), but this fallback should work

### Issue 2: html2pdf.js CSS Loading Issue
- The brochure HTML imports external fonts via Google Fonts CDN using `@import url(...)`
- When html2pdf.js creates an off-screen container and renders it, **external font imports may not load in time**
- Additionally, the HTML is a complete document with `<!DOCTYPE html>`, `<html>`, `<head>`, and `<body>` tags
- When inserted into a `<div>` container via `innerHTML`, this creates **invalid nested HTML structure** (body inside div inside body)

---

## Solution

### Part 1: Create Storage Bucket
Create the missing `documents` storage bucket so brochures can be stored and accessed via public URL.

### Part 2: Fix Frontend PDF Generation
Modify `JourneyConfirmation.tsx` to properly handle the HTML response:

1. **Extract body content** - Parse the HTML and extract just the `<body>` content instead of inserting the entire document
2. **Inline critical styles** - Extract and inject the `<style>` block alongside the content
3. **Add loading delay** - Allow fonts to load before rendering
4. **Better error handling** - Add console logging to debug issues

---

## Implementation Details

### Database Migration
```sql
-- Create documents bucket for brochure storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents', 
  true,
  5242880, -- 5MB limit
  ARRAY['text/html', 'application/pdf']::text[]
);

-- Add RLS policy for public read access
CREATE POLICY "Public read access for documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');

-- Allow service role to upload
CREATE POLICY "Service role can upload documents"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'documents');
```

### Code Changes: `src/pages/JourneyConfirmation.tsx`

Update the `handleDownloadPdf` function to properly handle the HTML response:

```typescript
const handleDownloadPdf = async () => {
  if (!itineraryId) return;
  setIsGeneratingPdf(true);
  
  try {
    console.log('[PDF] Fetching brochure HTML...');
    const { data, error } = await supabase.functions.invoke('generate-itinerary-pdf', {
      body: { itinerary_id: itineraryId }
    });
    
    if (error) throw error;
    if (!data?.html) throw new Error('No brochure content received');
    
    console.log('[PDF] HTML received, length:', data.html.length);
    
    // Parse the HTML document to extract body content and styles
    const parser = new DOMParser();
    const doc = parser.parseFromString(data.html, 'text/html');
    
    // Extract styles from head
    const styleContent = doc.querySelector('style')?.innerHTML || '';
    
    // Create container with proper structure
    const container = document.createElement('div');
    container.id = 'pdf-render-container';
    container.style.cssText = 'position: absolute; left: -9999px; top: 0; width: 800px;';
    
    // Inject styles and body content
    container.innerHTML = `
      <style>${styleContent}</style>
      ${doc.body.innerHTML}
    `;
    
    document.body.appendChild(container);
    
    // Allow fonts to load (Google Fonts needs time)
    console.log('[PDF] Waiting for fonts to load...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate PDF
    console.log('[PDF] Generating PDF...');
    const opt = {
      margin: 10,
      filename: `journey-brochure-${itineraryId.substring(0, 8)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true,
        logging: false,
        letterRendering: true 
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    await html2pdf().set(opt).from(container).save();
    
    // Cleanup
    document.body.removeChild(container);
    console.log('[PDF] Download complete!');
    toast.success('Brochure downloaded!');
    
  } catch (e) {
    console.error('[PDF] Generation failed:', e);
    toast.error('Failed to generate brochure. Please try again.');
  } finally {
    setIsGeneratingPdf(false);
  }
};
```

### Key Fixes:

1. **Parse HTML properly** - Use `DOMParser` to parse the complete HTML document
2. **Extract body content** - Get just the content from `doc.body.innerHTML`
3. **Extract styles** - Copy the `<style>` block from the document head
4. **Font loading delay** - Wait 1 second for Google Fonts to load
5. **Add margin** - Set `margin: 10` to avoid content cutoff
6. **Better logging** - Add console logs for debugging

---

## Files to Modify

1. **Database Migration** - Create `documents` storage bucket with RLS policies
2. **`src/pages/JourneyConfirmation.tsx`** - Fix the PDF generation logic

---

## Verification Steps

After implementation:
1. Navigate to `/journey/confirmation/{itinerary_id}`
2. Click "Download Your Journey Brochure"
3. Verify PDF downloads with proper formatting
4. Check console for debug logs showing successful generation

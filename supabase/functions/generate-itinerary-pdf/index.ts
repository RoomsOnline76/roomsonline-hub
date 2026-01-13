import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Format currency
function formatCurrency(amount: number, currency: string = "ZAR"): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
  }).format(amount);
}

// Format date
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Calculate nights
function calculateNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

interface Stay {
  propertyId: string;
  propertyName: string;
  propertyImage?: string;
  roomTypeId?: string;
  roomTypeName?: string;
  rateTypeId?: string;
  rateTypeName?: string;
  checkIn: string;
  checkOut: string;
  guests: {
    adults: number;
    children?: number;
    infants?: number;
  };
  price: number;
  nights: number;
  city?: string;
  country?: string;
}

function generateBrochureHTML(itinerary: any, stays: Stay[]): string {
  const staysHTML = stays.map((stay, index) => `
    <div class="stay-card">
      <div class="stay-header">
        <span class="stay-number">Stay ${index + 1}</span>
        <span class="stay-dates">${formatDate(stay.checkIn)} – ${formatDate(stay.checkOut)}</span>
      </div>
      ${stay.propertyImage ? `<img src="${stay.propertyImage}" alt="${stay.propertyName}" class="stay-image" />` : ''}
      <div class="stay-content">
        <h3 class="property-name">${stay.propertyName}</h3>
        ${stay.city ? `<p class="property-location">${stay.city}${stay.country ? `, ${stay.country}` : ''}</p>` : ''}
        <div class="stay-details">
          <div class="detail-row">
            <span class="detail-label">Duration</span>
            <span class="detail-value">${stay.nights} night${stay.nights > 1 ? 's' : ''}</span>
          </div>
          ${stay.roomTypeName ? `
          <div class="detail-row">
            <span class="detail-label">Room</span>
            <span class="detail-value">${stay.roomTypeName}</span>
          </div>
          ` : ''}
          <div class="detail-row">
            <span class="detail-label">Guests</span>
            <span class="detail-value">${stay.guests.adults} Adult${stay.guests.adults > 1 ? 's' : ''}${stay.guests.children ? `, ${stay.guests.children} Child${stay.guests.children > 1 ? 'ren' : ''}` : ''}${stay.guests.infants ? `, ${stay.guests.infants} Infant${stay.guests.infants > 1 ? 's' : ''}` : ''}</span>
          </div>
          <div class="detail-row price-row">
            <span class="detail-label">Price</span>
            <span class="detail-value">${formatCurrency(stay.price, itinerary.currency || 'ZAR')}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Journey – ${itinerary.title || 'Travel Itinerary'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      background: #fff;
    }
    
    /* Header */
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 2px solid #1a1a1a;
    }
    
    .header img {
      max-width: 180px;
      height: auto;
      margin: 0 auto 12px auto;
      display: block;
    }
    
    .tagline {
      font-size: 9pt;
      letter-spacing: 3px;
      color: #666;
      text-transform: uppercase;
      margin-top: 4px;
    }
    
    /* Title */
    h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 28pt;
      font-weight: 600;
      text-align: center;
      margin: 30px 0 10px;
      letter-spacing: -0.5px;
    }
    
    .subtitle {
      text-align: center;
      color: #666;
      font-size: 12pt;
      margin-bottom: 30px;
    }
    
    h2 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 16pt;
      font-weight: 600;
      margin: 30px 0 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e91e8c;
    }
    
    /* Guest Info */
    .guest-info {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    
    .guest-info h3 {
      font-size: 11pt;
      font-weight: 600;
      margin-bottom: 12px;
    }
    
    .guest-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    
    .guest-field {
      display: flex;
      flex-direction: column;
    }
    
    .guest-label {
      font-size: 9pt;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .guest-value {
      font-size: 11pt;
      font-weight: 500;
    }
    
    /* Stay Cards */
    .stays-container {
      margin-bottom: 30px;
    }
    
    .stay-card {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    
    .stay-header {
      background: linear-gradient(135deg, #1a1a1a 0%, #333 100%);
      color: white;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .stay-number {
      font-weight: 600;
      font-size: 12pt;
    }
    
    .stay-dates {
      font-size: 10pt;
      opacity: 0.9;
    }
    
    .stay-image {
      width: 100%;
      height: 180px;
      object-fit: cover;
    }
    
    .stay-content {
      padding: 16px;
    }
    
    .property-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 16pt;
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .property-location {
      color: #666;
      font-size: 10pt;
      margin-bottom: 16px;
    }
    
    .stay-details {
      border-top: 1px solid #eee;
      padding-top: 12px;
    }
    
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
    }
    
    .detail-label {
      color: #666;
    }
    
    .detail-value {
      font-weight: 500;
    }
    
    .price-row {
      border-top: 1px solid #eee;
      margin-top: 8px;
      padding-top: 12px;
    }
    
    .price-row .detail-value {
      color: #e91e8c;
      font-weight: 600;
      font-size: 12pt;
    }
    
    /* Summary */
    .summary-box {
      background: linear-gradient(135deg, #f8f9fa 0%, #fff 100%);
      border: 2px solid #1a1a1a;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 30px;
    }
    
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
    }
    
    .summary-label {
      font-size: 11pt;
    }
    
    .summary-value {
      font-weight: 500;
    }
    
    .total-row {
      border-top: 2px solid #1a1a1a;
      margin-top: 12px;
      padding-top: 16px;
    }
    
    .total-row .summary-label {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 14pt;
      font-weight: 600;
    }
    
    .total-row .summary-value {
      color: #e91e8c;
      font-size: 18pt;
      font-weight: 700;
    }
    
    /* Footer */
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
    }
    
    .footer p {
      font-size: 9pt;
      color: #666;
      margin-bottom: 8px;
    }
    
    .footer .brochure-id {
      font-family: monospace;
      font-size: 8pt;
      color: #999;
    }
    
    @media print {
      body {
        padding: 20px;
      }
      
      .stay-card {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" />
    <p class="tagline">Curated African Hospitality</p>
  </div>
  
  <!-- Title -->
  <h1>${itinerary.title || 'Your Journey'}</h1>
  <p class="subtitle">${itinerary.total_nights} nights across ${stays.length} destination${stays.length > 1 ? 's' : ''}</p>
  
  <!-- Guest Information -->
  <div class="guest-info">
    <h3>Guest Information</h3>
    <div class="guest-grid">
      <div class="guest-field">
        <span class="guest-label">Name</span>
        <span class="guest-value">${itinerary.guest_name || 'Guest'}</span>
      </div>
      <div class="guest-field">
        <span class="guest-label">Email</span>
        <span class="guest-value">${itinerary.guest_email || '-'}</span>
      </div>
      ${itinerary.guest_phone ? `
      <div class="guest-field">
        <span class="guest-label">Phone</span>
        <span class="guest-value">${itinerary.guest_phone}</span>
      </div>
      ` : ''}
    </div>
  </div>
  
  <!-- Itinerary -->
  <h2>Your Itinerary</h2>
  <div class="stays-container">
    ${staysHTML}
  </div>
  
  <!-- Summary -->
  <div class="summary-box">
    <div class="summary-row">
      <span class="summary-label">Total Nights</span>
      <span class="summary-value">${itinerary.total_nights} night${itinerary.total_nights > 1 ? 's' : ''}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Properties</span>
      <span class="summary-value">${stays.length} destination${stays.length > 1 ? 's' : ''}</span>
    </div>
    <div class="summary-row total-row">
      <span class="summary-label">Total Price</span>
      <span class="summary-value">${formatCurrency(itinerary.total_price, itinerary.currency || 'ZAR')}</span>
    </div>
  </div>
  
  ${itinerary.special_requests ? `
  <h2>Special Requests</h2>
  <p style="font-style: italic; color: #666;">"${itinerary.special_requests}"</p>
  ` : ''}
  
  <!-- Footer -->
  <div class="footer">
    <p>This brochure was generated on ${new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    <p class="brochure-id">Itinerary ID: ${itinerary.id}</p>
    <p style="margin-top: 16px;">
      <strong>RoomsOnline</strong> – Curated African Hospitality<br />
      <a href="https://sleepinafrica.roomsonline.co.za" style="color: #e91e8c;">sleepinafrica.roomsonline.co.za</a>
    </p>
  </div>
</body>
</html>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { itinerary_id } = await req.json();

    if (!itinerary_id) {
      return new Response(
        JSON.stringify({ error: "itinerary_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch itinerary
    const { data: itinerary, error: itineraryError } = await supabase
      .from("itineraries")
      .select("*")
      .eq("id", itinerary_id)
      .single();

    if (itineraryError || !itinerary) {
      return new Response(
        JSON.stringify({ error: "Itinerary not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse stays
    const stays: Stay[] = typeof itinerary.stays === 'string' 
      ? JSON.parse(itinerary.stays) 
      : itinerary.stays || [];

    // Enrich stays with property images if available
    const propertyIds = [...new Set(stays.map(s => s.propertyId))];
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, main_image, city, country")
      .in("id", propertyIds);

    const propertyMap = new Map(properties?.map(p => [p.id, p]) || []);
    
    const enrichedStays = stays.map(stay => ({
      ...stay,
      propertyImage: propertyMap.get(stay.propertyId)?.main_image || stay.propertyImage,
      city: stay.city || propertyMap.get(stay.propertyId)?.city,
      country: stay.country || propertyMap.get(stay.propertyId)?.country,
    }));

    // Generate HTML brochure
    const html = generateBrochureHTML(itinerary, enrichedStays);

    // Store HTML in storage bucket for client-side PDF generation
    const fileName = `brochures/itinerary-${itinerary_id}-${Date.now()}.html`;
    
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, html, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      // Return HTML directly if storage fails
      return new Response(
        JSON.stringify({ 
          html,
          message: "HTML generated successfully (storage unavailable)"
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(fileName);

    // Update itinerary with brochure URL
    await supabase
      .from("itineraries")
      .update({ 
        brochure_pdf_url: urlData.publicUrl,
        brochure_generated_at: new Date().toISOString()
      })
      .eq("id", itinerary_id);

    return new Response(
      JSON.stringify({ 
        html,
        html_url: urlData.publicUrl,
        message: "Brochure generated successfully"
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: unknown) {
    console.error("Error generating brochure:", error);
    const message = error instanceof Error ? error.message : "Failed to generate brochure";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

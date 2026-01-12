// Contract agreement text generator with dynamic property details

export interface PropertyContractDetails {
  name: string;
  registeredName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  telephone?: string;
  mobileNumber?: string;
  email?: string;
  physicalAddress?: string;
  postalAddress?: string;
  keyRepresentative?: string;
}

// Generate contract HTML with property details
export function generateContractHTML(property?: PropertyContractDetails): string {
  const propertySection = property ? `
  <table class="w-full mb-6 text-sm border-collapse">
    <tbody>
      <tr class="border-b"><td class="py-2 font-medium w-40">Registered Name</td><td>${property.registeredName || property.name || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Registration number</td><td>${property.registrationNumber || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">VAT number</td><td>${property.vatNumber || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Telephone number</td><td>${property.telephone || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Mobile number</td><td>${property.mobileNumber || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">E-mail address</td><td>${property.email || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Physical address</td><td>${property.physicalAddress || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Postal address</td><td>${property.postalAddress || property.physicalAddress || 'N/A'}</td></tr>
      <tr class="border-b"><td class="py-2 font-medium">Key Representative</td><td>${property.keyRepresentative || 'N/A'}</td></tr>
    </tbody>
  </table>
  ` : `<p class="mb-6 text-sm italic text-muted-foreground">[Property details will be displayed here]</p>`;

  return `
<div class="contract-text">
  <h1 class="text-2xl font-bold text-center mb-6">ROOMSONLINE ACCOMMODATION LISTING & DISTRIBUTION AGREEMENT</h1>
  
  <p class="mb-4 text-sm leading-relaxed">
    This Agreement sets out the terms and conditions on which Roomsonline provides online accommodation listing, booking facilitation, payment collection, and related distribution services to accommodation establishments, and the basis upon which the Establishment agrees to be listed and promoted on the Roomsonline platform.
  </p>
  
  <p class="mb-6 text-sm leading-relaxed">
    The parties acknowledge that Roomsonline operates solely as a booking and distribution platform and does not own, manage, or control the Establishment. The Establishment remains solely responsible for the operation of its accommodation business and for the delivery of accommodation services to Customers.
  </p>

  <h2 class="text-lg font-semibold mb-3">1. ROOMSONLINE</h2>
  <table class="w-full mb-6 text-sm border-collapse">
    <tbody>
      <tr class="border-b"><td class="py-1 font-medium w-40">Registered Name</td><td>Sleep in Africa (Pty) Ltd t/a Roomsonline</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Registration number</td><td>2014012490</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Mobile number</td><td>082 323 8115</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">E-mail address</td><td>Carike@roomsonline.co.za</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Physical address</td><td>29 Woodlands Close, Parklands, 7441</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Postal address</td><td>29 Woodlands Close, Parklands, 7441</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Key Representative</td><td>Carike Ligthelm</td></tr>
      <tr class="border-b"><td class="py-1 font-medium">Bank account details</td><td>Bank: FNB | Account holder: Sleep in Africa (PTY) LTD | Account: 62453541700 | Branch: 203809</td></tr>
    </tbody>
  </table>

  <h2 class="text-lg font-semibold mb-3">2. THE PROPERTY</h2>
  ${propertySection}

  <h2 class="text-lg font-semibold mb-3">3. COMMISSION AND FEES</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Roomsonline charges a commission of <strong>ten percent (10%)</strong> (VAT exclusive) of the Total Booking Value for all bookings made via the Roomsonline Software, unless otherwise agreed in writing.
  </p>

  <h2 class="text-lg font-semibold mb-3">4. DEFINITIONS</h2>
  <p class="mb-2 text-sm leading-relaxed">In this Agreement, unless the context indicates otherwise:</p>
  <ul class="list-disc pl-6 mb-6 text-sm space-y-1">
    <li><strong>"Roomsonline"</strong>, "we", "us" or "our" means Sleep in Africa (Pty) Ltd trading as Roomsonline.</li>
    <li><strong>"You"</strong> or "your" means the accommodation establishment listed, or seeking to be listed, on the Roomsonline Software, including any authorised representative thereof.</li>
    <li><strong>"Roomsonline Software"</strong> means all websites, applications, systems, databases, and platforms owned, operated, or controlled by Roomsonline, including third‑party platforms making use of Roomsonline data.</li>
    <li><strong>"Establishment"</strong> means the accommodation establishment listed or proposed to be listed on the Roomsonline Software.</li>
    <li><strong>"Content"</strong> means all information supplied by you relating to the Establishment, including descriptions, photographs, rates, availability, and related information.</li>
    <li><strong>"Listing"</strong> means the public or private display of the Establishment on the Roomsonline Software.</li>
    <li><strong>"Customer"</strong> means any person who makes or benefits from a booking at the Establishment through the Roomsonline Software.</li>
    <li><strong>"Total Booking Value"</strong> means the full value of a booking, including accommodation, fees, and included services.</li>
    <li><strong>"Applicable Cancellation Policy"</strong> means the cancellation policy applicable to a particular booking at the time of confirmation.</li>
    <li><strong>"Satisfactory Stay"</strong> and <strong>"Unsatisfactory Stay"</strong> have the meanings assigned to them in this Agreement.</li>
  </ul>
  <p class="mb-6 text-sm">Words in the singular include the plural and vice versa.</p>

  <h2 class="text-lg font-semibold mb-3">5. LISTING OF THE ESTABLISHMENT</h2>
  <ul class="list-decimal pl-6 mb-6 text-sm space-y-2">
    <li>Roomsonline may, acting reasonably and in its discretion, approve, decline, withdraw, or suspend the Listing of any Establishment.</li>
    <li>Roomsonline shall not be liable for any loss arising from the withdrawal or suspension of a Listing.</li>
    <li>Certain categories of establishments may be declined, including those associated with unethical or illegal activities.</li>
    <li>Roomsonline may determine the placement and presentation of Listings at its discretion.</li>
  </ul>

  <h2 class="text-lg font-semibold mb-3">6. DELISTING</h2>
  <ul class="list-decimal pl-6 mb-6 text-sm space-y-2">
    <li>Roomsonline may Delist an Establishment at any time.</li>
    <li>Upon request by the Establishment, Roomsonline will Delist within five (5) business days. Existing confirmed bookings must be honoured.</li>
    <li>No right to continued listing is created by this Agreement.</li>
  </ul>

  <h2 class="text-lg font-semibold mb-3">7. CONTENT AND INTELLECTUAL PROPERTY</h2>
  <ul class="list-decimal pl-6 mb-6 text-sm space-y-2">
    <li>You warrant that all Content is accurate, lawful, and owned or licensed by you.</li>
    <li>You grant Roomsonline a perpetual, royalty‑free right to use, adapt, and publish the Content for marketing and operational purposes.</li>
  </ul>

  <h2 class="text-lg font-semibold mb-3">8. BOOKINGS AND PAYMENTS</h2>
  <ul class="list-decimal pl-6 mb-6 text-sm space-y-2">
    <li>Roomsonline acts as payment collection agent for the Establishment.</li>
    <li>Payouts will be made subject to commission deductions and verification of a Satisfactory Stay.</li>
    <li>Roomsonline may withhold payments for up to seven (7) days after checkout.</li>
  </ul>

  <h2 class="text-lg font-semibold mb-3">9. NON‑DELIVERY AND CUSTOMER PROTECTION</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Where a Customer experiences an Unsatisfactory Stay or non‑delivery, Roomsonline may refund the Customer and recover such amounts from the Establishment.
  </p>

  <h2 class="text-lg font-semibold mb-3">10. CANCELLATIONS AND REFUNDS</h2>
  <ul class="list-decimal pl-6 mb-6 text-sm space-y-2">
    <li>Cancellations are governed by the Applicable Cancellation Policy.</li>
    <li>Any ambiguity shall be interpreted in favour of the Customer.</li>
  </ul>

  <h2 class="text-lg font-semibold mb-3">11. FRAUD AND PAYMENT REVERSALS</h2>
  <p class="mb-6 text-sm leading-relaxed">
    The Establishment remains responsible for fraudulent or reversed payments.
  </p>

  <h2 class="text-lg font-semibold mb-3">12. OPERATION OF THE ESTABLISHMENT</h2>
  <p class="mb-6 text-sm leading-relaxed">
    The Establishment remains solely responsible for legal compliance, insurance, staffing, and operations.
  </p>

  <h2 class="text-lg font-semibold mb-3">13. AFFILIATES AND PARTNERS</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Roomsonline may collaborate with affiliate partners to promote Listings.
  </p>

  <h2 class="text-lg font-semibold mb-3">14. DATA PROTECTION</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Both parties shall comply with the Protection of Personal Information Act.
  </p>

  <h2 class="text-lg font-semibold mb-3">15. AUTHORITATIVE RECORDS</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Roomsonline records shall prevail in the event of disputes.
  </p>

  <h2 class="text-lg font-semibold mb-3">16. CHANGES TO THE AGREEMENT</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Roomsonline may amend this Agreement upon forty‑eight (48) hours' notice.
  </p>

  <h2 class="text-lg font-semibold mb-3">17. LIMITATION OF LIABILITY AND INDEMNITY</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Roomsonline's liability is limited to the commission paid by the Establishment.
  </p>

  <h2 class="text-lg font-semibold mb-3">18. SOFTWARE DISCLAIMER</h2>
  <p class="mb-6 text-sm leading-relaxed">
    The Roomsonline Software is provided on an "as‑is" basis.
  </p>

  <h2 class="text-lg font-semibold mb-3">19. FORCE MAJEURE</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Neither party shall be liable for failure to perform due to events beyond reasonable control.
  </p>

  <h2 class="text-lg font-semibold mb-3">20. CONFIDENTIALITY</h2>
  <p class="mb-6 text-sm leading-relaxed">
    Each party shall keep Confidential Information private for three (3) years following termination.
  </p>

  <h2 class="text-lg font-semibold mb-3">21. INDEPENDENT CONTRACTOR</h2>
  <p class="mb-6 text-sm leading-relaxed">
    The parties act as independent contractors and no partnership or employment relationship is created.
  </p>

  <h2 class="text-lg font-semibold mb-3">22. GOVERNING LAW</h2>
  <p class="mb-6 text-sm leading-relaxed">
    This Agreement is governed by the laws of South Africa.
  </p>

  <h2 class="text-lg font-semibold mb-3">23. ELECTRONIC SIGNATURES AND ACCEPTANCE</h2>
  <p class="mb-6 text-sm leading-relaxed">
    This Agreement may be accepted electronically or by conduct and is enforceable in terms of the Electronic Communications and Transactions Act 25 of 2002.
  </p>
</div>
`;
}

// Generate signature block HTML for signed contracts
export interface SignatureData {
  signedByName: string;
  signedByEmail: string;
  signedByDesignation?: string;
  signatureImageUrl: string;
  signedAt: string;
}

export interface ContractMetadata {
  contractId: string;
  downloadedAt?: string;
  version?: number;
}

export interface CoveredProperty {
  name: string;
}

export function generateSignatureBlockHTML(signature: SignatureData): string {
  const signedDate = new Date(signature.signedAt).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  
  return `
  <div class="signature-block mt-8 pt-6 border-t-2 border-primary">
    <h2 class="text-lg font-semibold mb-4">SIGNED</h2>
    <div class="grid grid-cols-2 gap-6">
      <div>
        <p class="text-sm font-medium mb-1">For the Establishment:</p>
        <p class="text-sm"><strong>Name:</strong> ${signature.signedByName}</p>
        <p class="text-sm"><strong>Email:</strong> ${signature.signedByEmail}</p>
        ${signature.signedByDesignation ? `<p class="text-sm"><strong>Designation:</strong> ${signature.signedByDesignation}</p>` : ''}
        <p class="text-sm"><strong>Date:</strong> ${signedDate}</p>
      </div>
      <div>
        <p class="text-sm font-medium mb-2">Signature:</p>
        <img src="${signature.signatureImageUrl}" alt="Signature" class="max-h-24 border rounded p-2 bg-white" />
      </div>
    </div>
  </div>
  `;
}

// ROL Logo as base64 data URL - works in about:blank without network requests
const ROL_LOGO_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAABQCAYAAACj6kh7AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAABHvSURBVHgB7Z0LlBTVmce/qu6e7unu6e6ZnmHe8hiYAQZEQFBQ8BXR+IgxZtckRo2uMYkmm83GR3bNJq7RJEY3mhdxzSZuNruJu26MSTRxNa4xCj4xCAgiIiiMMwPzpp+v6r71VXX3DAPMDIPMkN+Zc2a6qqtv3a76139/3733q6oBBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8Fg7BO4wWCMEKZpCsMwaOLJpJ5MJnS0T8BicVgq4vG4YZrmZrSrA0YNhsFg7CUEJR6LxQKJRMJPBBKJHEKE+f1+XfD5fDq2p+E6REmU8BlhKBQK4t9afX19u8FgjBKslLUXiEQi0mT0eiYBiQ9Jh/0+Lnm9yXYsaGmAEWbYWWEhQWuHgoZtCoIgKDhMEHR1dWXj8bjU0tJSazAYow6TrD3A5XJBv379k4BYfYD9EJYWLFtNi5xhOBijDDMJdxOvNxBVZOkNIl5LBIloJwikRUi0DG5RMEY/TEHYDZRYFLz1qvKDOHWFaEFZpQI6LjH4E6FRxhhVsJZwN1BEJLWGBB2mOFoQsJhVxljWaRBcSMR/6wVgMEY1TLJ2AyVI4EYwqgsJzQ4pDIJd/IkzGEaS4GXBY+wlmEnYB0hwxCZ9Z9R2l1EFVipEUEpwNHEIBqJL91AikejQdT1UVFSkGwzGKIT1sPoIJUnB+AJ/iLgk0jCaBJLHPp0xSrp7BuMdZ9g5aVoKBFsXOGTJEIUU7qfwG4MxqrBSwj7S3d2d5PV60hQYCXQS1WuBfM4LPZDvI3xEvx1mMEYpLIblQ2ORAFEqR9KcqWr/pKIEdBLUu6EZulq/iNLuWMBgjA7YhRfBEKSmJ1NaC+EGN1gqrjw+u+k9AYMxumCStY8EAgE95vVOBELBXVCRLhJW0jyFnJIyGKMRKxncB8i3FCFt5cVLzBRB8BZBWQiMwRidWMngPhAMBrW+ffsOBYLgFvPVi3s/l8MdG4LBxr+NKpSNaAIPMEYpb0kVdwZW1t2XPG8w/1Q6gA3FLsHQU8kChmIrKZYt+AwGQygU0rG+A6x9cVksNqrqsqugGNb9CVW3N4FH5UJyJKC+bPCuuSsQCIz1er0JFstijCqslHAPIBIJRJNFR4Dg+AHAPuDCcKI6E8o11sUY1cxQAuNpokxEI4rDjFGLlQzuBZQG9YRN8kfBgpLKGKbR1JxglOcq4z8QjGqsizGqYSlhL9B1PSjrwAc2OA4c2gTsS3UJgkrJDAIbL0YWloLbOIPxbmIVKXLKPKDfyU0qEnDOSWojZO4P9rseO5rDw4O5fQP3qchjXYxRi1X0R5hA4ZOFwIAbOKR6XH93YcMqRQ+H+cNrO2J8wpbZKXLfaJNIl/h1MxijFquLMUJ4N3xFfYWsAk4gP1HY8AWCQpYoQYIBnKX6J0v9H5x1OwNHl5xJ1xGIEfOEoU4hpEuhuXBfWWf2hqHCTMI9hJSkJE2nIu5zRQMxMIX+8xEJdAXOF/sH/2sTiGnQcuQ7NV2HJHEAy03mKKFDQJDa8ql+xFIJDKHQUhiKNPqZqXPOt/tJyJGi5TJCPqzjzBKsZPANhmHohiGbhk5uMa3HYhIhMx+CLQPfKkAq8s4dWoxEF4FBPqyERCIRMAxjA3QxNQ+k3mQwRgwrJdxLKI7l9/sHgwUdAPJF+AAmg3Bsp7hT8k+EXz1l2rRZ4PcE3xGLG7/1wNuzM6lCIQjW0g/W7xijmtcrWaZpmhFDN0kM1cWWRwT7Gn8EvJF3/eCYCYcfCsHwpgMh/GDvQv3s/y4IJiPh8xmjlmH7sAzDSMiy7MRKNk2D4N4LmUwmjpULqxIuKwUJmqpqCZq6urpS1jfYoT+t/+NNZXd1tfz8Rt4Dz0NYgPj/Qb5LKwYIJBKJVk3TnNjQSjS1NJBhtL3D8bO1tbWGLMuuKRcpqIXCHD5T5sOOxoIvHPLl/w3mZrPmLzzn2H8/+pAp1fCDn/W/+w7kkwf2MsxXkk4m4+msrn/5xw8e/K/X/hxCv5gKXzz2mEPJZ2GMA6wRVDiSTSYTwUQiEXF2dEYQBAIBb9DrJXHAdLzH8/f9fPrMmeOh9c2XTw9pB7xjzZF+M+DPJZQv6CvXHxzPTEHsaMAwDBhbWLQbxmgGVfKA5vGkO1pbd5qGzrhdNvfHI39x1HmnSz//4YvQtvOAd/+lqqISogcOF4OiD8F4FJLJ5DZZlhd9/h7fG5fceB/kk++0b4FBIjwI51KGpxvMrLBbUJNQFHVjJm8+1dD5gqEfMfGT48F5yLuuP+i/L/1myxWvzz03fvCK7NV3n3vMAfX+K75xFty37ECIZSQ4BqO/VwB+IqOC4h6CUqt3hGXzEYikD0Gn+gxd11Mth3h+cM81J8MFZV86fQqccU0TPgcdC4cxhjl+M5R11dXVtTY3N8faO3YEAMvQ7OU3L/0TwmYwbk1BPx/oMY2wt1gdAEcuGvZ3xBQ9B88aLz7L0SQXlZrJ+CBJNIfSbJ1P0FPRV1auqXg6d+GE41+7fEb4v1ILGzZC3pODJGYA9H+1HZyiAEWo39AajGqsWK/bTSuqqiqxfPlyRWxri0K0Xc5esHjSv//4n/8I0vu+fdUMBjpYBuM9RUXFhMv+9u9rYNJkSL71Grr3Z5X5G+bDQYwxRi1WMrgbBIJBPeL1jiNpLJGS2giGPxs2mPNhmGVBhmFBWYAaOGZNbOHDNvw7EqFASdYiMJYfCmM3xDsNxqjlDR/LkkXfOGIyzKuD1u1N0H/3QDjxgKYGYMOSUDTYbhj4TqxZYFBM3i4p9IMBjFFJNBrVZFnetjgvvD2oy1tgn9J5f5+E7Ycw8D+5MwZJKiTzKZD4u6xLHjuRJ6EgJMmwHJqbf4Fw8Kl4LRKuLkVf+Vvfb3kBYpQZFOP5h8L4TUEf9MMYT/l7A3b8kwXi0EMxzW1QCqlYM5hzyjT06dPH2Yw8Y4xhtGN1ERxJ4VO8I/xBhm3X2wE+sNeDgRcQPp8DGSoPJexA0BUDNvHBCDBGMdaYjD0gEAjoBNNaDeYJkG7u8XdpqKBwECbDDJpKsIR8JH2IwB9uo4e6RQYaM9wNMN5NLAdNL2GSOGTqCNAUAx0hDxQaOLAbjD2Gxax2A8k/JR5ADSwCQIoMH4e/+eZ8uu8M9lVGFSxYMNZhhmGIwD5k2Bz6SYbZIYPaHIYJFoSwdoADpQXj0E3F/IfBYIxCmB/l3UTXdU1q7UhBMnogWCT7b4WJMJH+YTBGNUyydhNCQJNyidl4L8DAZcCupv8QPAG6A9kwlhKEtEPBsDtmMN5FLE/rblJeXq6RXFJ7CyT5IUhJDh2B4s4CUEqrA8dBH7IhK8EYG+y1ZA3DUI5haM/Rz6DfZGwJZv+PwRglcAyj9wRVG/oQSFxlYnMANBKsMWANHIBx6bMsZDCjr2bY4L8Wht4bCoqmcY8nqNxkMQbrKcAqWQzjzWC/e1hWYYVpGLqBVKP/7lchOQEXCvzaZJ5BVKYRFBQJGIxRy/6QLKDgvhvF/n5EpmgbqF6YFxzwRDRBAaxJVyIj4gcZjL3mTSlZ6bv/QT+DQXDZ7wU0fISI1iawNIoN1CzYl4KfhKKBPIMx6mFfWvQGJMt2WJCSoIMm01K+Y0GJNwbzIWgowCg/R1COUJnQICSpAfK/Y4HBGPVY6WgvMQ3T0NqaWlM+MN8BYBdA1dFo+qUQaFkIz0WYiP5eI7pIkgE+YIxqrMdBv0EcI/CQPgIEYQvw2Gk+5IQR+I6P6DIjVDLq0RQrGY1Ao1VQwGDIyXhsSjBqsGTq75FgWElPnPi2Q2Ew/gAEhx4YqL2F7i4sDwQDFoGPw/VhYGwMKuMNZo1Dj8M4BEbBAYWBN4O91tGMZSVh3A/gOI7OgMFgaBRl8gE5lrQbTJ0wJi4eE85BaYL5CKzTYTkHhkLtTxwYLjHbhp7u7uCB4TpEwfjh2wfC1AKKhEiTwhBh6jKQJNhNSCZEIAhGwE4GKB9xRwB8gQgYBm4Qf8dhMBhlkL2IQxrqwXFPwBnwZRAKWkexgZJNGABJpRBhSjgwmKMaJll7DrEOPJMAl0U4vhMIQgA0p2S9EwLhYIRZYCyy4AuHJZh1JmMUY5WyfYPdDAYA3Q58YCJRmxJIjCDIARiTDPZiP4j8gCShBaghJ4NAhOZgCERhCN4fGfWBGEzMYOx12F5EY3chhqKJmhbITULhV+E+hIkHD4RCfb+NJCECVgzr3UHKxkc0nYCxGqZg6BQcSW8lzlHNNNVTMJrBfg0ZjFHNfhmS5SjSTPhAoJhqJqgzoCMZG6jJqhHB5jYLwnFc1hP6vQ0dw7X6CSLJhEIYI+F8MBijjv2RElqwH+MHhEnWaD14OyShFwpOGcE8eB4p0YBgEwzGmMF6VegbBENB04EIxkNaSSjlZYMhAnbYL4m4FMFxC0N+FxAM/4kADqPHCQYb0gFjZJPJnmN1MPzFYOxz/h8MBU/v+EMBxgAAAABJRU5ErkJggg==";

// Generate full signed contract HTML with professional branding (for download/print)
// Self-contained - no external dependencies (fonts, images embedded)
export function generateSignedContractHTML(
  property?: PropertyContractDetails, 
  signature?: SignatureData,
  metadata?: ContractMetadata,
  coveredProperties?: CoveredProperty[]
): string {
  const signedDate = signature?.signedAt 
    ? new Date(signature.signedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  
  const downloadDate = metadata?.downloadedAt 
    ? new Date(metadata.downloadedAt).toLocaleString('en-ZA', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : new Date().toLocaleString('en-ZA', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

  const coveredPropertiesInline = coveredProperties && coveredProperties.length > 0
    ? coveredProperties.map(p => p.name).join(', ')
    : 'All properties under this owner';

  const propertySection = property ? `
    <table class="info-table">
      <tr><td class="label">Registered Name</td><td>${property.registeredName || property.name || 'N/A'}</td></tr>
      <tr><td class="label">Reg. / VAT No.</td><td>${property.registrationNumber || 'N/A'} / ${property.vatNumber || 'N/A'}</td></tr>
      <tr><td class="label">Tel / Mobile</td><td>${property.telephone || 'N/A'} / ${property.mobileNumber || 'N/A'}</td></tr>
      <tr><td class="label">E-mail</td><td>${property.email || 'N/A'}</td></tr>
      <tr><td class="label">Address</td><td>${property.physicalAddress || 'N/A'}</td></tr>
      <tr><td class="label">Key Representative</td><td>${property.keyRepresentative || 'N/A'}</td></tr>
    </table>
  ` : '<p class="placeholder">[Property details will be displayed here]</p>';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signed Contract - ${property?.name || 'Roomsonline Agreement'}</title>
  <style>
    /* Page setup - removes browser headers/footers */
    @page {
      size: A4;
      margin: 12mm 15mm !important;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      margin: 0 !important;
      padding: 0 !important;
    }
    
    body {
      font-family: Georgia, 'Times New Roman', Times, serif;
      font-size: 10pt;
      line-height: 1.45;
      color: #1a1a1a;
      max-width: 100%;
      padding: 15px;
      background: #fff;
    }
    
    /* Header */
    .header {
      text-align: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1.5px solid #1a1a1a;
    }
    
    .header img {
      max-width: 140px;
      height: auto;
      margin: 0 auto 4px auto;
      display: block;
    }
    
    .tagline {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      letter-spacing: 2px;
      color: #666;
      text-transform: uppercase;
      margin-top: 2px;
      text-align: center;
    }
    
    /* Title */
    h1 {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 14pt;
      font-weight: bold;
      text-align: center;
      margin: 12px 0 10px 0;
      letter-spacing: -0.3px;
    }
    
    h2 {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      font-weight: bold;
      margin: 10px 0 4px 0;
      color: #1a1a1a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    p {
      margin-bottom: 6px;
      text-align: justify;
    }
    
    .intro {
      font-size: 9pt;
      margin-bottom: 10px;
    }
    
    /* Tables */
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0 10px 0;
      font-size: 9pt;
    }
    
    .info-table td {
      padding: 4px 8px;
      border: 1px solid #ccc;
      vertical-align: top;
    }
    
    .info-table .label {
      width: 120px;
      font-weight: bold;
      background: #f5f5f5;
    }
    
    /* Lists */
    ul, ol {
      margin: 4px 0 8px 18px;
    }
    
    li {
      margin-bottom: 2px;
      font-size: 9pt;
    }
    
    /* Covered Properties Section */
    .covered-properties {
      background: #f8f9fa;
      border: 1px solid #ddd;
      border-radius: 3px;
      padding: 8px 12px;
      margin: 10px 0;
      font-size: 9pt;
    }
    
    .covered-properties strong {
      font-weight: bold;
    }
    
    /* Definitions - compact inline format */
    .definitions {
      font-size: 9pt;
      margin-bottom: 8px;
    }
    
    .definitions p {
      margin-bottom: 4px;
    }
    
    /* Combined sections */
    .section-group {
      margin-bottom: 8px;
    }
    
    .section-group h2 {
      margin-bottom: 4px;
    }
    
    .section-group p {
      font-size: 9pt;
      margin-bottom: 4px;
    }
    
    /* Signature Block - TABLE layout for reliable print */
    .signature-block {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 2px solid #1a1a1a;
      page-break-inside: avoid;
    }
    
    .signature-block h2 {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      margin-bottom: 12px;
    }
    
    .signature-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .signature-table td {
      padding: 0;
      border: none;
      vertical-align: top;
      width: 50%;
    }
    
    .signature-details p {
      margin-bottom: 4px;
      text-align: left;
      font-size: 9pt;
    }
    
    .signature-label {
      font-weight: bold;
      margin-bottom: 6px;
      font-size: 9pt;
      display: block;
    }
    
    .signature-img {
      max-height: 80px;
      max-width: 200px;
      border: 1px solid #ddd;
      border-radius: 3px;
      padding: 6px;
      background: #fff;
    }
    
    .signature-placeholder {
      width: 200px;
      height: 60px;
      border: 1px dashed #999;
      border-radius: 3px;
      display: table-cell;
      vertical-align: middle;
      text-align: center;
      color: #666;
      font-style: italic;
      font-size: 9pt;
      background: #fafafa;
    }
    
    /* Footer */
    .footer {
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px solid #ddd;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      color: #666;
    }
    
    .footer p {
      margin-bottom: 2px;
      text-align: left;
    }
    
    /* Print Styles - removes browser headers/footers */
    @media print {
      @page {
        size: A4;
        margin: 10mm 12mm !important;
      }
      
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      
      body {
        padding: 0 !important;
      }
      
      .signature-block {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <!-- Header with embedded Logo -->
  <div class="header">
    <img src="${ROL_LOGO_BASE64}" alt="Roomsonline" />
    <p class="tagline">Strategize • Optimize • Maximize</p>
  </div>

  <h1>ROOMSONLINE LISTING & DISTRIBUTION AGREEMENT</h1>

  <!-- Covered Properties - inline format -->
  <div class="covered-properties">
    <strong>Covered Properties:</strong> ${coveredPropertiesInline}
  </div>

  <p class="intro">This Agreement sets out terms on which Roomsonline provides online accommodation listing, booking facilitation, payment collection, and distribution services. The Establishment remains solely responsible for its accommodation business and delivery of services to Customers.</p>

  <h2>1. ROOMSONLINE</h2>
  <table class="info-table">
    <tr><td class="label">Registered Name</td><td>Sleep in Africa (Pty) Ltd t/a Roomsonline</td></tr>
    <tr><td class="label">Reg. No. / Mobile</td><td>2014012490 / 082 323 8115</td></tr>
    <tr><td class="label">E-mail</td><td>Carike@roomsonline.co.za</td></tr>
    <tr><td class="label">Address</td><td>29 Woodlands Close, Parklands, 7441</td></tr>
    <tr><td class="label">Bank Details</td><td>FNB | Sleep in Africa (PTY) LTD | 62453541700 | Branch: 203809</td></tr>
  </table>

  <h2>2. THE PROPERTY</h2>
  ${propertySection}

  <h2>3. COMMISSION</h2>
  <p>Roomsonline charges <strong>10% commission</strong> (VAT exclusive) of the Total Booking Value for all bookings via the Roomsonline Software, unless otherwise agreed in writing.</p>

  <h2>4. DEFINITIONS</h2>
  <div class="definitions">
    <p><strong>"Roomsonline"</strong> means Sleep in Africa (Pty) Ltd. <strong>"You"</strong> means the accommodation establishment listed on the Roomsonline Software. <strong>"Roomsonline Software"</strong> means all websites, apps, systems, and platforms operated by Roomsonline. <strong>"Establishment"</strong> means the accommodation listed on the Software. <strong>"Content"</strong> means all information supplied by you (descriptions, photos, rates, availability). <strong>"Listing"</strong> means the display of the Establishment on the Software. <strong>"Customer"</strong> means any person who makes a booking. <strong>"Total Booking Value"</strong> means the full booking value including fees. <strong>"Applicable Cancellation Policy"</strong> means the policy applicable at time of confirmation.</p>
  </div>

  <h2>5. LISTING</h2>
  <p>Roomsonline may approve, decline, withdraw, or suspend any Listing at its discretion and shall not be liable for any loss arising therefrom. Certain establishments associated with unethical or illegal activities may be declined.</p>

  <h2>6. DELISTING</h2>
  <p>Roomsonline may Delist an Establishment at any time. Upon request, Roomsonline will Delist within 5 business days. Existing confirmed bookings must be honoured.</p>

  <h2>7. CONTENT & IP</h2>
  <p>You warrant that all Content is accurate, lawful, and owned or licensed by you. You grant Roomsonline a perpetual, royalty-free right to use, adapt, and publish the Content for marketing and operational purposes.</p>

  <h2>8. BOOKINGS & PAYMENTS</h2>
  <p>Roomsonline acts as payment collection agent. Payouts are made subject to commission deductions and verification of a Satisfactory Stay. Roomsonline may withhold payments for up to 7 days after checkout.</p>

  <h2>9. CUSTOMER PROTECTION</h2>
  <p>Where a Customer experiences an Unsatisfactory Stay or non-delivery, Roomsonline may refund the Customer and recover amounts from the Establishment.</p>

  <h2>10. CANCELLATIONS</h2>
  <p>Cancellations are governed by the Applicable Cancellation Policy. Ambiguity shall be interpreted in favour of the Customer.</p>

  <div class="section-group">
    <h2>11–15. GENERAL PROVISIONS</h2>
    <p><strong>Fraud:</strong> The Establishment remains responsible for fraudulent or reversed payments. <strong>Operations:</strong> The Establishment is solely responsible for legal compliance, insurance, staffing, and operations. <strong>Affiliates:</strong> Roomsonline may collaborate with affiliate partners. <strong>Data Protection:</strong> Both parties shall comply with POPIA. <strong>Records:</strong> Roomsonline records prevail in disputes.</p>
  </div>

  <div class="section-group">
    <h2>16–22. ADMINISTRATIVE TERMS</h2>
    <p><strong>Changes:</strong> Roomsonline may amend this Agreement upon 48 hours' notice. <strong>Liability:</strong> Roomsonline's liability is limited to commission paid. <strong>Software:</strong> The Software is provided "as-is". <strong>Force Majeure:</strong> Neither party is liable for events beyond reasonable control. <strong>Confidentiality:</strong> Confidential Information shall be kept private for 3 years post-termination. <strong>Relationship:</strong> The parties are independent contractors. <strong>Governing Law:</strong> This Agreement is governed by South African law.</p>
  </div>

  <h2>23. ELECTRONIC SIGNATURES</h2>
  <p>This Agreement may be accepted electronically and is enforceable under the Electronic Communications and Transactions Act 25 of 2002.</p>

  <!-- Signature Block - TABLE layout for reliable print -->
  ${signature ? `
  <div class="signature-block">
    <h2>SIGNED</h2>
    <table class="signature-table">
      <tr>
        <td class="signature-details">
          <p><strong>Name:</strong> ${signature.signedByName}</p>
          <p><strong>Email:</strong> ${signature.signedByEmail}</p>
          ${signature.signedByDesignation ? `<p><strong>Designation:</strong> ${signature.signedByDesignation}</p>` : ''}
          <p><strong>Date:</strong> ${signedDate}</p>
        </td>
        <td>
          <span class="signature-label">Signature:</span>
          ${signature.signatureImageUrl 
            ? `<img src="${signature.signatureImageUrl}" alt="Signature" class="signature-img" />`
            : `<div class="signature-placeholder">Signature on file</div>`
          }
        </td>
      </tr>
    </table>
  </div>
  ` : ''}

  <!-- Footer -->
  <div class="footer">
    <p><strong>Downloaded:</strong> ${downloadDate} | <strong>Contract ID:</strong> ${metadata?.contractId || 'N/A'}${metadata?.version ? ` | Version: ${metadata.version}` : ''}</p>
  </div>
</body>
</html>
`;
}

// Generate plain text version for emails

export function generateContractPlainText(property?: PropertyContractDetails): string {
  const propertySection = property ? `
Registered Name: ${property.registeredName || property.name || 'N/A'}
Registration number: ${property.registrationNumber || 'N/A'}
VAT number: ${property.vatNumber || 'N/A'}
Telephone number: ${property.telephone || 'N/A'}
Mobile number: ${property.mobileNumber || 'N/A'}
E-mail address: ${property.email || 'N/A'}
Physical address: ${property.physicalAddress || 'N/A'}
Postal address: ${property.postalAddress || property.physicalAddress || 'N/A'}
Key Representative: ${property.keyRepresentative || 'N/A'}
` : '[Property details will be displayed here]';

  return `ROOMSONLINE ACCOMMODATION LISTING & DISTRIBUTION AGREEMENT

This Agreement sets out the terms and conditions on which Roomsonline provides online accommodation listing, booking facilitation, payment collection, and related distribution services to accommodation establishments, and the basis upon which the Establishment agrees to be listed and promoted on the Roomsonline platform.

The parties acknowledge that Roomsonline operates solely as a booking and distribution platform and does not own, manage, or control the Establishment. The Establishment remains solely responsible for the operation of its accommodation business and for the delivery of accommodation services to Customers.

1. ROOMSONLINE

Registered Name: Sleep in Africa (Pty) Ltd t/a Roomsonline
Registration number: 2014012490
Mobile number: 082 323 8115
E-mail address: Carike@roomsonline.co.za
Physical address: 29 Woodlands Close, Parklands, 7441
Key Representative: Carike Ligthelm
Bank account details: Bank: FNB | Account holder: Sleep in Africa (PTY) LTD | Account: 62453541700 | Branch: 203809

2. THE PROPERTY

${propertySection}

3. COMMISSION AND FEES

Roomsonline charges a commission of ten percent (10%) (VAT exclusive) of the Total Booking Value for all bookings made via the Roomsonline Software, unless otherwise agreed in writing.

4. DEFINITIONS

In this Agreement, unless the context indicates otherwise:

"Roomsonline", "we", "us" or "our" means Sleep in Africa (Pty) Ltd trading as Roomsonline.

"You" or "your" means the accommodation establishment listed, or seeking to be listed, on the Roomsonline Software, including any authorised representative thereof.

"Roomsonline Software" means all websites, applications, systems, databases, and platforms owned, operated, or controlled by Roomsonline, including third-party platforms making use of Roomsonline data.

"Establishment" means the accommodation establishment listed or proposed to be listed on the Roomsonline Software.

"Content" means all information supplied by you relating to the Establishment, including descriptions, photographs, rates, availability, and related information.

"Listing" means the public or private display of the Establishment on the Roomsonline Software.

"Customer" means any person who makes or benefits from a booking at the Establishment through the Roomsonline Software.

"Total Booking Value" means the full value of a booking, including accommodation, fees, and included services.

"Applicable Cancellation Policy" means the cancellation policy applicable to a particular booking at the time of confirmation.

"Satisfactory Stay" and "Unsatisfactory Stay" have the meanings assigned to them in this Agreement.

Words in the singular include the plural and vice versa.

5. LISTING OF THE ESTABLISHMENT

5.1 Roomsonline may, acting reasonably and in its discretion, approve, decline, withdraw, or suspend the Listing of any Establishment.

5.2 Roomsonline shall not be liable for any loss arising from the withdrawal or suspension of a Listing.

5.3 Certain categories of establishments may be declined, including those associated with unethical or illegal activities.

5.4 Roomsonline may determine the placement and presentation of Listings at its discretion.

6. DELISTING

6.1 Roomsonline may Delist an Establishment at any time.

6.2 Upon request by the Establishment, Roomsonline will Delist within five (5) business days. Existing confirmed bookings must be honoured.

6.3 No right to continued listing is created by this Agreement.

7. CONTENT AND INTELLECTUAL PROPERTY

7.1 You warrant that all Content is accurate, lawful, and owned or licensed by you.

7.2 You grant Roomsonline a perpetual, royalty-free right to use, adapt, and publish the Content for marketing and operational purposes.

8. BOOKINGS AND PAYMENTS

8.1 Roomsonline acts as payment collection agent for the Establishment.

8.2 Payouts will be made subject to commission deductions and verification of a Satisfactory Stay.

8.3 Roomsonline may withhold payments for up to seven (7) days after checkout.

9. NON-DELIVERY AND CUSTOMER PROTECTION

Where a Customer experiences an Unsatisfactory Stay or non-delivery, Roomsonline may refund the Customer and recover such amounts from the Establishment.

10. CANCELLATIONS AND REFUNDS

10.1 Cancellations are governed by the Applicable Cancellation Policy.

10.2 Any ambiguity shall be interpreted in favour of the Customer.

11. FRAUD AND PAYMENT REVERSALS

The Establishment remains responsible for fraudulent or reversed payments.

12. OPERATION OF THE ESTABLISHMENT

The Establishment remains solely responsible for legal compliance, insurance, staffing, and operations.

13. AFFILIATES AND PARTNERS

Roomsonline may collaborate with affiliate partners to promote Listings.

14. DATA PROTECTION

Both parties shall comply with the Protection of Personal Information Act.

15. AUTHORITATIVE RECORDS

Roomsonline records shall prevail in the event of disputes.

16. CHANGES TO THE AGREEMENT

Roomsonline may amend this Agreement upon forty-eight (48) hours' notice.

17. LIMITATION OF LIABILITY AND INDEMNITY

Roomsonline's liability is limited to the commission paid by the Establishment.

18. SOFTWARE DISCLAIMER

The Roomsonline Software is provided on an "as-is" basis.

19. FORCE MAJEURE

Neither party shall be liable for failure to perform due to events beyond reasonable control.

20. CONFIDENTIALITY

Each party shall keep Confidential Information private for three (3) years following termination.

21. INDEPENDENT CONTRACTOR

The parties act as independent contractors and no partnership or employment relationship is created.

22. GOVERNING LAW

This Agreement is governed by the laws of South Africa.

23. ELECTRONIC SIGNATURES AND ACCEPTANCE

This Agreement may be accepted electronically or by conduct and is enforceable in terms of the Electronic Communications and Transactions Act 25 of 2002.
`;
}

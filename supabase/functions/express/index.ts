import { corsHeaders } from './cors.ts';
console.log(`Function "browser-with-cors" up and running!`);
async function sha1(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b)=>b.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async (req)=>{
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { publicId, uploadPreset, action } = await req.json();
    const timestamp = Math.round(Date.now() / 1000);
    // 'destroy' firma el borrado de un asset (sin upload_preset, ver docs de
    // Cloudinary: /image/destroy solo firma public_id + timestamp).
    const paramsToSign = action === 'destroy'
      ? `public_id=${publicId}&timestamp=${timestamp}`
      : `public_id=${publicId}&timestamp=${timestamp}&upload_preset=${uploadPreset}`;
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    const signature = await sha1(paramsToSign + apiSecret);
    const data = {
      timestamp,
      signature
    };
    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});

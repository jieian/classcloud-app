import { NextRequest, NextResponse } from 'next/server';

const OMR_SERVICE_URL = process.env.OMR_SERVICE_URL ?? 'https://classcloud-appomr.onrender.com';

export async function POST(req: NextRequest) {

  const formData = await req.formData();

  let res: Response;
  try {
    res = await fetch(`${OMR_SERVICE_URL}/scan`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not reach the OMR service. Check that it is running.' },
      { status: 502 }
    );
  }

  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}

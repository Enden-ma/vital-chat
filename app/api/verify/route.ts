import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { passcode } = await request.json();
    
    // If no passcode is set in the environment, we assume no lock is needed
    if (!process.env.APP_PASSCODE) {
      return NextResponse.json({ valid: true });
    }

    const valid = passcode === process.env.APP_PASSCODE;
    return NextResponse.json({ valid });
  } catch (error) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }
}

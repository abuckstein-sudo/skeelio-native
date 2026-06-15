import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://aalqeqjlspxqhxohubfi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhbHFlcWpsc3B4cWhub2h1YmZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTgyNTM4MzMsImV4cCI6MjAzMzgyOTgzM30.Qw7C-dCKVhQlA25xjRuY8X1D_y79aKLZdKEQ7eHHEKk'
);

const testPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 63, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 184, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

const imageBase64 = Array.from(testPng).map(b => String.fromCharCode(b)).join('');
const btoa = (str) => Buffer.from(str, 'binary').toString('base64');
const dataUrl = 'data:image/png;base64,' + btoa(imageBase64);

console.log('Testing absorb-worksheet function...');
console.log('Image data URL length:', dataUrl.length);

const { data, error } = await supabase.functions.invoke('absorb-worksheet', {
  body: { image: dataUrl },
});

if (error) {
  console.error('Error:', error);
} else {
  console.log('Result:', JSON.stringify(data, null, 2));
}

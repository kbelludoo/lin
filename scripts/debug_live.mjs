import http from 'node:http';

async function callOllama(messages) {
  const reqBody = JSON.stringify({
    model: 'qwen2.5-coder:7b',
    messages,
    stream: false,
    options: { temperature: 0.1 }
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 11434,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(reqBody)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(reqBody);
    req.end();
  });
}

const sys = `You are an autonomous systems optimization engineer.
Available tools:
- view_file(relPath: string)
- read_profile()
- replace_file_content(relPath: string, oldString: string, newString: string)
- run_build(relPath: string)
- run_benchmark(relPath: string)

To call a tool, you MUST output a code block:
\`\`\`json
{"tool": "tool_name", "arguments": { ... }}
\`\`\`
`;

const res = await callOllama([
  { role: 'system', content: sys },
  { role: 'user', content: 'Inspect source.lin and profile, then optimize dispatch_next in source.lin to reduce seek distance.' }
]);

console.log('CONTENT:\n', res.message.content);

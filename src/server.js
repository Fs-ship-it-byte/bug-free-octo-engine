const express = require('express');
const app = express();
require('./debug_la18hd')(app);
app.get('/', (_, r) => r.send('<a href="/debug/la18hd?stream=espn">/debug/la18hd?stream=espn</a>'));
app.listen(process.env.PORT || 7000, () => console.log('debug listo'));

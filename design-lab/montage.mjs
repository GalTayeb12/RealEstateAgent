import sharp from "sharp";
const files = process.argv.slice(3);
const W=360,H=240;
const tiles = await Promise.all(files.map(async f=>({input: await sharp(f).resize(W,H,{fit:"cover"}).toBuffer()})));
const cols=4, rows=Math.ceil(tiles.length/cols);
for (const f of files){const m=await sharp(f).metadata();console.log(f,m.width+"x"+m.height)}
await sharp({create:{width:W*cols,height:H*rows,channels:3,background:"#888"}}).composite(tiles.map((t,i)=>({...t,left:(i%cols)*W,top:Math.floor(i/cols)*H}))).png().toFile(process.argv[2]);

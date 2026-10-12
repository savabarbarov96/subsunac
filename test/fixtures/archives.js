const AdmZip = require('adm-zip');
const { crc32 } = require('adm-zip/util');

function zip(files) {
  const archive = new AdmZip();
  for (const [name, contents] of Object.entries(files)) archive.addFile(name, Buffer.from(contents));
  return archive.toBuffer();
}

// Synthetic, uncompressed RAR5 fixtures; no third-party subtitle content.
// Header layout: https://www.rarlab.com/technote.htm
function vint(value) {
  const bytes = [];
  do {
    bytes.push((value & 0x7f) | (value > 0x7f ? 0x80 : 0));
    value = Math.floor(value / 128);
  } while (value);
  return Buffer.from(bytes);
}
function block(body) {
  const header = Buffer.concat([vint(body.length), body]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32LE(crc32(header) >>> 0);
  return Buffer.concat([checksum, header]);
}
function rar(files) {
  const blocks = [Buffer.from('526172211a070100', 'hex'), block(Buffer.from([1, 0, 0]))];
  for (const [name, contents] of Object.entries(files)) {
    const data = Buffer.from(contents);
    const filename = Buffer.from(name);
    blocks.push(block(Buffer.concat([
      Buffer.from([2, 2]), vint(data.length), Buffer.from([0]), vint(data.length),
      Buffer.from([0, 0, 1]), vint(filename.length), filename
    ])), data);
  }
  blocks.push(block(Buffer.from([5, 0, 0])));
  return Buffer.concat(blocks);
}
module.exports = { zip, rar };

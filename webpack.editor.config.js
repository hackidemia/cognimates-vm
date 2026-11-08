// Build the web VM and extension worker needed by the editor. The GUI bundles
// and minimizes VM source itself; the obsolete standalone .min UMD target and
// playground are not part of the integrated Cognimates application.
const config = require('./webpack.config')[0];
config.entry = {'scratch-vm': './src/index.js'};
module.exports = config;

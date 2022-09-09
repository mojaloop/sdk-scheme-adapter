const fs = require('fs');
const assert = require('assert');

assert(fs.statSync('docs/design-bulk-transfers/assets/api-sequence-diagram.svg').mtime.getTime() >
    fs.statSync('docs/design-bulk-transfers/api-sequence-diagram.PlantUML').mtime.getTime(),
    '"docs/design-bulk-transfers/assets/api-sequence-diagram.svg" is outdated. Regenerate using "docs/design-bulk-transfers/api-sequence-diagram.PlantUML"'
    )

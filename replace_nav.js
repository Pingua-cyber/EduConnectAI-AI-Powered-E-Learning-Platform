const fs = require('fs');
const path = require('path');

const regexNavFlexible = /<nav[^>]*fixed[^>]*bottom-0[^>]*>[\s\S]*?<\/nav>/g;

function processDirectory(dir, isTeacher) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file.endsWith('.ejs')) {
            const filePath = path.join(dir, file);
            let content = fs.readFileSync(filePath, 'utf8');
            let modified = false;

            if (content.match(regexNavFlexible)) {
                content = content.replace(regexNavFlexible, '');
                modified = true;
            }

            if (modified) {
                // Remove padding-bottom
                content = content.replace(/pb-32/g, 'pb-12');
                content = content.replace(/pb-24/g, 'pb-12');

                // If sidebar not already included, add it
                const partial = isTeacher ? "<%- include('../partials/teacher-sidebar') %>" : "<%- include('../partials/student-sidebar') %>";
                if (!content.includes(partial)) {
                    if (content.includes('<body')) {
                        content = content.replace(/(<body[^>]*>)/, '$1\n    ' + partial);
                    } else {
                        content = partial + '\n' + content;
                    }
                }

                fs.writeFileSync(filePath, content);
                console.log('Processed:', filePath);
            }
        }
    }
}

processDirectory(path.join(__dirname, 'frontend/views/student'), false);
processDirectory(path.join(__dirname, 'frontend/views/teacher'), true);
console.log("Done.");

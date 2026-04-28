#include <stdio.h>
#include <stdlib.h>

int main(void) {
  const char *command =
    "printf \"%s\\n\" \"$NAVI_INPUT_JSON\" | "
    "node -e \"$NAVI_BRIDGE\" \"$NAVI_CLAUDE_PATH\" "
    "--output-format stream-json --verbose --input-format stream-json --model sonnet";
  return system(command);
}

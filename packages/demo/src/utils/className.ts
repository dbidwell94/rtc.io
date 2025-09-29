// Define a recursive type for class values, similar to the one used in clsx.
type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | { [key: string]: unknown }
  | ClassValue[];

/**
 * A tagged template literal function for conditionally joining class names,
 * inspired by the `clsx` library.
 *
 * @param {TemplateStringsArray} strings - The static string parts of the template literal.
 * @param {...ClassValue[]} values - The dynamic values to be processed.
 * @returns {string} A single string of space-separated class names.
 */
export const cls = (
  strings: TemplateStringsArray,
  ...values: ClassValue[]
): string => {
  const classNames: string[] = [];

  /**
   * Recursively processes a value to extract class names.
   * @param {ClassValue} arg - The value to process.
   */
  const process = (arg: ClassValue) => {
    // Ignore any falsy values (null, undefined, false, 0, '')
    if (!arg) return;

    // Strings and numbers are added directly.
    if (typeof arg === "string" || typeof arg === "number") {
      classNames.push(String(arg));
      return;
    }

    // If it's an array, process each item recursively.
    if (Array.isArray(arg)) {
      arg.forEach(process);
      return;
    }

    // If it's an object, add the keys whose values are truthy.
    if (typeof arg === "object") {
      Object.keys(arg).forEach((key) => {
        if (arg[key]) {
          classNames.push(key);
        }
      });
    }
  };

  // Iterate through both the static strings and the dynamic values.
  for (let i = 0; i < strings.length; i++) {
    // Split the static strings by whitespace to handle multi-class strings.
    strings[i].split(/\s+/).forEach(process);
    // Process the interpolated value that follows the static string.
    if (i < values.length) {
      process(values[i]);
    }
  }

  // Join all the collected class names with a space.
  // The `process` function already filters out empty/falsy values,
  // but a final filter ensures correctness if the split results in empty strings.
  return classNames.filter(Boolean).join(" ");
};

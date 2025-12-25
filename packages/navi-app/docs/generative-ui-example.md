# Generative UI Example

This demonstrates the experimental generative UI functionality in Claude Code UI.

## Simple Button Example

Here's a simple interactive button:

```genui
<div>
  <h3>Interactive Counter</h3>
  <button id="counter-btn">Click me! Count: 0</button>
  <script>
    let count = 0;
    const btn = document.getElementById('counter-btn');
    btn.addEventListener('click', () => {
      count++;
      btn.textContent = `Click me! Count: ${count}`;
    });
  </script>
</div>
```

## Form Example

Here's an interactive form:

```genui
<form id="user-form">
  <div style="margin-bottom: 12px;">
    <label for="name">Name:</label>
    <input type="text" id="name" name="name" required style="display: block; width: 100%; margin-top: 4px;">
  </div>
  
  <div style="margin-bottom: 12px;">
    <label for="email">Email:</label>
    <input type="email" id="email" name="email" required style="display: block; width: 100%; margin-top: 4px;">
  </div>
  
  <div style="margin-bottom: 12px;">
    <label for="role">Role:</label>
    <select id="role" name="role" style="display: block; width: 100%; margin-top: 4px;">
      <option value="developer">Developer</option>
      <option value="designer">Designer</option>
      <option value="manager">Manager</option>
    </select>
  </div>
  
  <button type="submit">Submit</button>
</form>

<div id="form-result" style="margin-top: 16px; padding: 12px; background: #f3f4f6; border-radius: 6px; display: none;">
  <strong>Form submitted!</strong>
  <div id="submitted-data"></div>
</div>

<script>
  document.getElementById('user-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {};
    for (let [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    document.getElementById('form-result').style.display = 'block';
    document.getElementById('submitted-data').innerHTML = 
      Object.entries(data).map(([key, value]) => `<div>${key}: ${value}</div>`).join('');
  });
</script>
```

## Calculator Example

```genui
<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; max-width: 300px;">
  <h3 style="margin-top: 0;">Simple Calculator</h3>
  
  <input type="text" id="display" readonly style="width: 100%; padding: 8px; font-size: 18px; text-align: right; margin-bottom: 12px;">
  
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
    <button onclick="clearDisplay()">C</button>
    <button onclick="deleteLast()">←</button>
    <button onclick="addToDisplay('/')" style="background: #e5e7eb;">÷</button>
    <button onclick="addToDisplay('*')" style="background: #e5e7eb;">×</button>
    
    <button onclick="addToDisplay('7')">7</button>
    <button onclick="addToDisplay('8')">8</button>
    <button onclick="addToDisplay('9')">9</button>
    <button onclick="addToDisplay('-')" style="background: #e5e7eb;">-</button>
    
    <button onclick="addToDisplay('4')">4</button>
    <button onclick="addToDisplay('5')">5</button>
    <button onclick="addToDisplay('6')">6</button>
    <button onclick="addToDisplay('+')" style="background: #e5e7eb;">+</button>
    
    <button onclick="addToDisplay('1')">1</button>
    <button onclick="addToDisplay('2')">2</button>
    <button onclick="addToDisplay('3')">3</button>
    <button onclick="calculate()" style="background: #3b82f6; grid-row: span 2;">=</button>
    
    <button onclick="addToDisplay('0')" style="grid-column: span 2;">0</button>
    <button onclick="addToDisplay('.')">.</button>
  </div>
  
  <script>
    let display = document.getElementById('display');
    let currentInput = '';
    
    function addToDisplay(value) {
      currentInput += value;
      display.value = currentInput;
    }
    
    function clearDisplay() {
      currentInput = '';
      display.value = '';
    }
    
    function deleteLast() {
      currentInput = currentInput.slice(0, -1);
      display.value = currentInput;
    }
    
    function calculate() {
      try {
        // Simple evaluation - in production, use a proper math parser
        let result = eval(currentInput.replace('×', '*').replace('÷', '/'));
        currentInput = result.toString();
        display.value = currentInput;
      } catch (error) {
        display.value = 'Error';
        currentInput = '';
      }
    }
  </script>
</div>
```

## How it Works

1. **Code Block Detection**: The system detects `\`\`\`genui` code blocks in markdown
2. **XSS Protection**: Sanitizes HTML content by removing script tags and dangerous attributes
3. **Sandboxed Rendering**: Uses an iframe with `sandbox="allow-scripts allow-forms"` for isolation
4. **Interaction Capture**: Captures user interactions and emits them via postMessage
5. **Parent Communication**: Sends interaction data to the parent component for handling

## Security Features

- **Sandboxed iframe**: No `allow-same-origin`, preventing access to parent page data
- **XSS protection**: Strips dangerous script tags and javascript: URLs
- **Controlled interactions**: All user interactions are captured and can be monitored
- **Input validation**: Form data is validated before processing

This experimental feature allows Claude to generate interactive UI components while maintaining security isolation.
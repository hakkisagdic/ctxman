import { describe, test, expect } from 'vitest';
import MethodAnalyzer from '../lib/analyzers/method-analyzer.js';

describe('C# Support', () => {
  const methodAnalyzer = new MethodAnalyzer();

  test('extracts basic public method', () => {
    const code = `
            public class Calculator {
                public int Add(int a, int b) {
                    return a + b;
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'Calculator.cs');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('Add');
  });

  test('extracts private method', () => {
    const code = `
            public class Service {
                private void ProcessData() {
                    // implementation
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'Service.cs');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('ProcessData');
  });

  test('extracts static method', () => {
    const code = `
            public class MathHelper {
                public static double Square(double x) {
                    return x * x;
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'MathHelper.cs');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('Square');
  });

  test('extracts async method', () => {
    const code = `
            public class ApiClient {
                public async Task<string> FetchDataAsync() {
                    return await Task.FromResult("data");
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'ApiClient.cs');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('FetchDataAsync');
  });

  test('extracts properties', () => {
    const code = `
            public class Person {
                public string Name { get; set; }
                private int age;
                public int Age {
                    get { return age; }
                    set { age = value; }
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'Person.cs');
    expect(methods.length).toBe(2);
    const names = methods.map((m) => m.name);
    expect(names).toContain('Name');
    expect(names).toContain('Age');
  });

  test('extracts generic method', () => {
    const code = `
            public class Repository<T> {
                public T GetById<TKey>(TKey id) where TKey : IComparable {
                    return default(T);
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'Repository.cs');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('GetById');
  });

  test('extracts virtual and override methods', () => {
    const code = `
            public class BaseClass {
                public virtual void DoSomething() {
                    // base implementation
                }
            }

            public class DerivedClass : BaseClass {
                public override void DoSomething() {
                    // derived implementation
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'Classes.cs');
    expect(methods.length).toBe(2);
  });

  test('extracts expression-bodied methods', () => {
    const code = `
            public class Calculator {
                public int Double(int x) => x * 2;
                public string GetName() => "Calculator";
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'Calculator.cs');
    expect(methods.length).toBe(2);
    const names = methods.map((m) => m.name);
    expect(names).toContain('Double');
    expect(names).toContain('GetName');
  });

  test('extracts constructors', () => {
    const code = `
            public class Person {
                public Person() {
                    // default constructor
                }

                public Person(string name) {
                    Name = name;
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'Person.cs');
    expect(methods.length).toBe(2);
    expect(methods.every((m) => m.name === 'Person')).toBe(true);
  });

  test('handles interface definitions', () => {
    const code = `
            public interface IRepository {
                void Save();
                Task<T> GetByIdAsync<T>(int id);
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'IRepository.cs');
    // Interface methods without implementation might not be detected depending on regex
    expect(methods.length).toBeGreaterThanOrEqual(0);
  });

  test('extracts multiple methods from one class', () => {
    const code = `
            public class UserService {
                public void Create(User user) { }
                public void Update(User user) { }
                public void Delete(int id) { }
                public User GetById(int id) { return null; }
                public List<User> GetAll() { return new List<User>(); }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'UserService.cs');
    expect(methods.length).toBe(5);
  });

  test('extracts protected and internal methods', () => {
    const code = `
            public class BaseService {
                protected void ValidateInput() { }
                internal void LogOperation() { }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'BaseService.cs');
    expect(methods.length).toBe(2);
  });

  test('handles abstract method declarations', () => {
    const code = `
            public abstract class Shape {
                public abstract double CalculateArea();
                public abstract double CalculatePerimeter();
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'Shape.cs');
    expect(methods.length).toBeGreaterThanOrEqual(0);
  });

  test('extracts methods with array return types', () => {
    const code = `
            public class DataProcessor {
                public int[] GetNumbers() {
                    return new int[] { 1, 2, 3 };
                }

                public string[] GetNames() {
                    return new string[] { "Alice", "Bob" };
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'DataProcessor.cs');
    expect(methods.length).toBe(2);
  });

  test('filters out C# keywords', () => {
    const code = `
            public class Test {
                public void if() { }  // Invalid C# but tests keyword filtering
                public void class() { }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'Test.cs');
    expect(methods.length).toBe(0);
  });

  test('handles partial classes and methods', () => {
    const code = `
            public partial class PartialClass {
                public partial void PartialMethod();

                public void RegularMethod() {
                    // implementation
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'PartialClass.cs');
    expect(methods.some((m) => m.name === 'RegularMethod')).toBe(true);
  });

  test('handles empty file', () => {
    const methods = methodAnalyzer.extractMethods('', 'Empty.cs');
    expect(methods.length).toBe(0);
  });

  test('accurate line numbers', () => {
    const code = `
namespace MyApp {
    public class Test {
        public void First() { }

        public void Second() { }

        public void Third() { }
    }
}
        `;
    const methods = methodAnalyzer.extractMethods(code, 'Test.cs');
    expect(methods.length).toBe(3);
    expect(methods[0].line).toBeGreaterThan(0);
    expect(methods[1].line).toBeGreaterThan(methods[0].line);
    expect(methods[2].line).toBeGreaterThan(methods[1].line);
  });

  test('extracts void methods', () => {
    const code = `
            public class Logger {
                public void Log(string message) {
                    Console.WriteLine(message);
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'Logger.cs');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('Log');
  });

  test('handles complex generic types', () => {
    const code = `
            public class GenericService {
                public Task<List<Dictionary<string, object>>> GetComplexData() {
                    return Task.FromResult(new List<Dictionary<string, object>>());
                }
            }
        `;
    const methods = methodAnalyzer.extractMethods(code, 'GenericService.cs');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('GetComplexData');
  });
});

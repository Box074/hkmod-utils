
public static partial class Program
{
    private class AssemblyResolver : IAssemblyResolver
    {
        public AssemblyResolver(string[] assemblys, string ignore)
        {
            foreach (var v in assemblys)
            {
                if (v == ignore) continue;
                var bytes = File.ReadAllBytes(v);
                var ass = AssemblyDefinition.ReadAssembly(new MemoryStream(bytes), new ReaderParameters()
                {
                    AssemblyResolver = new AssemblyResolver(assemblyMap)
                });
                assemblyMap.Add(ass.Name.Name, ass);
                Program.assemblys[ass.Name.Name] = Assembly.Load(bytes);
            }
        }
        public AssemblyResolver(Dictionary<string, AssemblyDefinition> map) => assemblyMap = map;
        public Dictionary<string, AssemblyDefinition> assemblyMap = new();
        AssemblyDefinition IAssemblyResolver.Resolve(AssemblyNameReference name)
        {
            if (assemblyMap.TryGetValue(name.Name, out var v)) return v;
            return null;
        }
        AssemblyDefinition IAssemblyResolver.Resolve(AssemblyNameReference name, ReaderParameters rp)
        {
            if (assemblyMap.TryGetValue(name.Name, out var v)) return v;
            return null;
        }
        void IDisposable.Dispose()
        {
            foreach (var v in assemblyMap.Values) v.Dispose();
        }
    }
    static void Main(string[] args)
    {
        using (var ar = new AssemblyResolver(args, args[0]))
        {
            var origAssembly = Assembly.Load(File.ReadAllBytes(args[0]));
            assemblys.Add(origAssembly.GetName().Name, origAssembly);
            using (var s = File.Open(args[0], FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite))
            using (var ad = AssemblyDefinition.ReadAssembly(s, new ReaderParameters()
            {
                AssemblyResolver = ar,
                SymbolReaderProvider = new DefaultSymbolReaderProvider(true)
            }))
            {
                
                Console.WriteLine($"Pdb Type: {ad.MainModule.SymbolReader.GetType().FullName}");
                ILModifyAssembly(ad);
                ad.Write(new WriterParameters()
                {
                    SymbolWriterProvider = new DefaultSymbolWriterProvider()
                });
            }
        }
    }
    public static void ILModifyType(TypeDefinition type)
    {
        CheckCP(type, type.CustomAttributes);
        foreach (var v in type.Methods) ILModify(v);
        foreach (var v in type.NestedTypes.Where(x => !IsNoModify(x.CustomAttributes))) ILModifyType(v);

        foreach (var v in type.Fields.Where(x => !IsNoModify(x.CustomAttributes)))
        {
            if (v.FieldType is GenericInstanceType git and
                {
                    ElementType.FullName: "HKTool.Utils.Compile.Ref`1"
                })
            {
                v.FieldType = type.Module.ImportReference(new ByReferenceType(git.GenericArguments[0]));
            }
            CheckCP(v, v.CustomAttributes);
        }
        foreach (var v in type.Properties.Where(x => !IsNoModify(x.CustomAttributes)))
        {
            if (v.PropertyType is GenericInstanceType git and
                {
                    ElementType.FullName: "HKTool.Utils.Compile.Ref`1"
                })
            {
                v.PropertyType = type.Module.ImportReference(new ByReferenceType(git.GenericArguments[0]));
            }
            CheckCP(v, v.CustomAttributes);
        }
    }

    public static bool IsNoModify(IEnumerable<CustomAttribute> attr) => attr.Any(x => x.AttributeType.FullName == "HKTool.Attributes.NoModifyAttribute");
    public static void ILModify(MethodDefinition method)
    {
        CheckCP(method, method.CustomAttributes);
        if(IsNoModify(method.CustomAttributes)) return;
        if (method.ReturnType is GenericInstanceType git and
            {
                ElementType.FullName: "HKTool.Utils.Compile.Ref`1"
            } && !IsNoModify(method.MethodReturnType.CustomAttributes))
        {
            method.ReturnType = method.Module.ImportReference(new ByReferenceType(git.GenericArguments[0]));
        }
        if (!method.HasBody) return;
        if (method.Body.Instructions.Count == 0) return;

        var i = method.Body.Instructions[0];
        var p = method.Body.GetILProcessor();
        var next = i;
        foreach (var v in method.Body.Variables)
        {
            if (v.VariableType is GenericInstanceType git2 and
                {
                    ElementType.FullName: "HKTool.Utils.Compile.Ref`1"
                })
            {
                v.VariableType = method.Module.ImportReference(new ByReferenceType(git2.GenericArguments[0]));
            }
        }
        while ((i = next) is not null)
        {
            next = i.Next;
            if(i.Operand is MemberReference mr)
            {
                CheckCUP(mr, method, i);
            }
            if(i.Operand is GenericInstanceType git2 and {
                ElementType.FullName: "HKTool.Utils.Compile.Ref`1"
            })
            {
                i.Operand = method.Module.ImportReference(new ByReferenceType(git2.GenericArguments[0]));
            }
        }
    }
    public static void ILModifyAssembly(AssemblyDefinition ass)
    {
        foreach (var m in ass.Modules)
        {
            foreach (var v in m.Types.Where(x => !IsNoModify(x.CustomAttributes))) ILModifyType(v);
            var mscorlib = m.AssemblyReferences.FirstOrDefault(x => x.Name == "mscorlib");
            foreach (var a in m.AssemblyReferences)
            {
                if (a.Name == "System.Private.CoreLib")
                {
                    a.Name = mscorlib.Name;
                    a.Attributes = mscorlib.Attributes;
                    a.Hash = mscorlib.Hash;
                    a.PublicKey = mscorlib.PublicKey;
                    a.PublicKeyToken = mscorlib.PublicKeyToken;
                    a.Version = mscorlib.Version;
                    a.Culture = mscorlib.Culture;
                }
            }
        }
    }

}
